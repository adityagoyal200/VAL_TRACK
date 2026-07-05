//! Live lobby / match roster: who is in your game, their agent, rank, and the
//! weapon skins they run. Works across the three phases the client exposes:
//!   - INGAME  (core-game): full 10-player roster + loadouts
//!   - PREGAME (agent select): your 5 allies + ranks (enemy hidden by Riot)
//!   - MENUS:   your party only
//!
//! All read-only. Ranks come from each player's MMR record; names from the
//! name-service (in case a player is running incognito in the client UI).

use std::collections::HashMap;

use serde::Serialize;

use super::local::{self, Region, Session};
use super::pvp;
use super::{content, tiers};

/// The skin socket on a weapon — its `Item.ID` is the equipped skin's UUID.
const SKIN_SOCKET: &str = "bcef87d6-209b-46c6-8b19-fbe40bd95abc";

#[derive(Debug, Serialize)]
pub struct LobbyPlayer {
    pub puuid: String,
    pub name: String,
    pub tag: String,
    pub team: String,
    pub is_self: bool,
    pub agent: String,
    pub agent_icon: String,
    pub tier: u8,
    pub tier_name: String,
    pub rr: i32,
    pub peak_tier: u8,
    pub peak_name: String,
    pub wins: i32,
    pub games: i32,
    pub level: i64,
    pub incognito: bool,
}

#[derive(Debug, Serialize)]
pub struct Lobby {
    /// "INGAME" | "PREGAME" | "MENUS"
    pub phase: String,
    pub match_id: String,
    /// Whether the current phase exposes weapon loadouts (in-game only).
    pub has_loadouts: bool,
    pub players: Vec<LobbyPlayer>,
}

#[derive(Debug, Serialize)]
pub struct WeaponSkin {
    pub weapon: String,
    pub skin: String,
    pub icon: String,
}

#[derive(Debug, Serialize)]
pub struct RecentMatch {
    pub map: String,
    pub mode: String,
    pub agent: String,
    pub kills: i32,
    pub deaths: i32,
    pub assists: i32,
    pub score: i32,
    pub won: bool,
    pub rounds_won: i32,
    pub rounds_lost: i32,
}

/// One raw roster slot before name/rank/agent enrichment.
struct RawPlayer {
    puuid: String,
    team: String,
    character_id: String,
    level: i64,
    incognito: bool,
}

/// Shared per-call context: authenticated agents + endpoint bases.
struct Ctx {
    strict: ureq::Agent,
    session: Session,
    region: Region,
    version: String,
}

impl Ctx {
    fn build() -> Result<Ctx, String> {
        let local_agent = super::local_agent();
        let session = local::session(&local_agent)?;
        let region = local::pvp_region(&local_agent)?;
        let strict = super::strict_agent();
        let version = pvp::client_version(&strict)?;
        Ok(Ctx { strict, session, region, version })
    }

    /// GLZ base, e.g. https://glz-na-1.na.a.pvp.net
    fn glz(&self) -> String {
        format!("https://glz-{}-1.{}.a.pvp.net", self.region.pvp, self.region.shard)
    }

    /// Player-data base, e.g. https://pd.na.a.pvp.net
    fn pd(&self) -> String {
        format!("https://pd.{}.a.pvp.net", self.region.shard)
    }

    fn get_opt(&self, url: &str) -> Result<Option<serde_json::Value>, String> {
        pvp::pvp_get_opt(&self.strict, url, &self.session, &self.version)
    }

    fn get(&self, url: &str) -> Result<serde_json::Value, String> {
        pvp::pvp_get(&self.strict, url, &self.session, &self.version)
    }
}

/// Detect the current phase and return the enriched roster.
pub fn fetch_lobby() -> Result<Lobby, String> {
    let ctx = Ctx::build()?;
    let me = ctx.session.puuid.clone();

    // In-game first (most useful), then agent-select, then menus.
    if let Some(pl) = ctx.get_opt(&format!("{}/core-game/v1/players/{}", ctx.glz(), me))? {
        if let Some(match_id) = pl["MatchID"].as_str() {
            let m = ctx.get(&format!("{}/core-game/v1/matches/{}", ctx.glz(), match_id))?;
            let raw = parse_coregame(&m);
            let players = enrich(&ctx, raw, &me)?;
            return Ok(Lobby {
                phase: "INGAME".into(),
                match_id: match_id.into(),
                has_loadouts: true,
                players,
            });
        }
    }

    if let Some(pl) = ctx.get_opt(&format!("{}/pregame/v1/players/{}", ctx.glz(), me))? {
        if let Some(match_id) = pl["MatchID"].as_str() {
            let m = ctx.get(&format!("{}/pregame/v1/matches/{}", ctx.glz(), match_id))?;
            let raw = parse_pregame(&m);
            let players = enrich(&ctx, raw, &me)?;
            return Ok(Lobby {
                phase: "PREGAME".into(),
                match_id: match_id.into(),
                has_loadouts: false,
                players,
            });
        }
    }

    // Menus: fall back to the player's party.
    let raw = parse_party(&ctx, &me)?;
    let players = enrich(&ctx, raw, &me)?;
    Ok(Lobby {
        phase: "MENUS".into(),
        match_id: String::new(),
        has_loadouts: false,
        players,
    })
}

fn parse_coregame(m: &serde_json::Value) -> Vec<RawPlayer> {
    m["Players"]
        .as_array()
        .map(|arr| arr.iter().map(raw_from_player).collect())
        .unwrap_or_default()
}

fn parse_pregame(m: &serde_json::Value) -> Vec<RawPlayer> {
    // During comp agent-select only AllyTeam is populated (enemy is hidden).
    let mut out = Vec::new();
    for key in ["AllyTeam", "EnemyTeam"] {
        if let Some(players) = m[key]["Players"].as_array() {
            for p in players {
                out.push(raw_from_player(p));
            }
        }
    }
    out
}

fn raw_from_player(p: &serde_json::Value) -> RawPlayer {
    let id = &p["PlayerIdentity"];
    RawPlayer {
        puuid: p["Subject"].as_str().unwrap_or_default().to_string(),
        team: p["TeamID"].as_str().unwrap_or("").to_string(),
        character_id: p["CharacterID"].as_str().unwrap_or_default().to_string(),
        level: id["AccountLevel"].as_i64().unwrap_or(0),
        incognito: id["Incognito"].as_bool().unwrap_or(false),
    }
}

fn parse_party(ctx: &Ctx, me: &str) -> Result<Vec<RawPlayer>, String> {
    let pp = ctx.get_opt(&format!("{}/parties/v1/players/{}", ctx.glz(), me))?;
    let Some(pp) = pp else { return Ok(Vec::new()) };
    let Some(party_id) = pp["CurrentPartyID"].as_str() else { return Ok(Vec::new()) };
    let party = ctx.get(&format!("{}/parties/v1/parties/{}", ctx.glz(), party_id))?;
    Ok(party["Members"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .map(|p| RawPlayer {
                    puuid: p["Subject"].as_str().unwrap_or_default().to_string(),
                    team: "Party".to_string(),
                    character_id: String::new(),
                    level: p["PlayerIdentity"]["AccountLevel"].as_i64().unwrap_or(0),
                    incognito: p["PlayerIdentity"]["Incognito"].as_bool().unwrap_or(false),
                })
                .collect()
        })
        .unwrap_or_default())
}

/// Resolve names (one batched request), ranks (per player), and agents, then
/// order the roster with the local player's team first and self on top.
fn enrich(ctx: &Ctx, raw: Vec<RawPlayer>, me: &str) -> Result<Vec<LobbyPlayer>, String> {
    let names = resolve_names(ctx, &raw);
    let my_team = raw
        .iter()
        .find(|p| p.puuid == me)
        .map(|p| p.team.clone())
        .unwrap_or_default();

    let mut players: Vec<LobbyPlayer> = raw
        .into_iter()
        .map(|p| {
            let (name, tag) = names
                .get(&p.puuid)
                .cloned()
                .unwrap_or_else(|| (String::new(), String::new()));
            let s = pvp::player_stats(&ctx.strict, &ctx.region.shard, &p.puuid, &ctx.session, &ctx.version);
            let ag = if p.character_id.is_empty() {
                content::AgentInfo { name: "—".into(), icon: String::new() }
            } else {
                content::agent(&p.character_id)
            };
            LobbyPlayer {
                is_self: p.puuid == me,
                puuid: p.puuid,
                name,
                tag,
                team: p.team,
                agent: ag.name,
                agent_icon: ag.icon,
                tier: s.tier,
                tier_name: tiers::tier_name(s.tier),
                rr: s.rr,
                peak_tier: s.peak_tier,
                peak_name: tiers::tier_name(s.peak_tier),
                wins: s.wins,
                games: s.games,
                level: p.level,
                incognito: p.incognito,
            }
        })
        .collect();

    // Self's team first, then the enemy team; self floats to the top of its team.
    players.sort_by_key(|p| {
        let team_rank = if p.team == my_team { 0 } else { 1 };
        let self_rank = if p.is_self { 0 } else { 1 };
        (team_rank, self_rank)
    });
    Ok(players)
}

/// Batch-resolve puuids -> (game name, tag) via the name-service.
fn resolve_names(ctx: &Ctx, raw: &[RawPlayer]) -> HashMap<String, (String, String)> {
    let mut out = HashMap::new();
    if raw.is_empty() {
        return out;
    }
    let body = serde_json::Value::Array(
        raw.iter()
            .map(|p| serde_json::Value::String(p.puuid.clone()))
            .collect(),
    );
    let url = format!("{}/name-service/v2/players", ctx.pd());
    if let Ok(v) = pvp::pvp_put(&ctx.strict, &url, &body, &ctx.session, &ctx.version) {
        if let Some(arr) = v.as_array() {
            for e in arr {
                if let Some(subject) = e["Subject"].as_str() {
                    out.insert(
                        subject.to_string(),
                        (
                            e["GameName"].as_str().unwrap_or_default().to_string(),
                            e["TagLine"].as_str().unwrap_or_default().to_string(),
                        ),
                    );
                }
            }
        }
    }
    out
}

/// A single player's equipped weapon skins in the current live match.
/// Only meaningful in-game — errors politely otherwise.
pub fn fetch_loadout(puuid: &str) -> Result<Vec<WeaponSkin>, String> {
    let ctx = Ctx::build()?;
    let me = &ctx.session.puuid;

    let pl = ctx
        .get_opt(&format!("{}/core-game/v1/players/{}", ctx.glz(), me))?
        .ok_or_else(|| "Loadouts are only visible during a live match.".to_string())?;
    let match_id = pl["MatchID"]
        .as_str()
        .ok_or_else(|| "No active match.".to_string())?;

    let data = ctx.get(&format!("{}/core-game/v1/matches/{}/loadouts", ctx.glz(), match_id))?;
    let loadouts = data["Loadouts"].as_array().cloned().unwrap_or_default();

    let entry = loadouts
        .iter()
        .find(|l| l["Loadout"]["Subject"].as_str() == Some(puuid))
        .ok_or_else(|| "Player not found in this match.".to_string())?;

    let items = &entry["Loadout"]["Items"];
    let mut skins: Vec<WeaponSkin> = Vec::new();
    if let Some(map) = items.as_object() {
        for (weapon_uuid, item) in map {
            let skin_uuid = item["Sockets"][SKIN_SOCKET]["Item"]["ID"]
                .as_str()
                .unwrap_or_default();
            if skin_uuid.is_empty() {
                continue;
            }
            let info = content::skin(skin_uuid);
            skins.push(WeaponSkin {
                weapon: content::weapon_name(weapon_uuid),
                skin: info.name,
                icon: info.icon,
            });
        }
    }
    skins.sort_by(|a, b| a.weapon.cmp(&b.weapon));
    Ok(skins)
}

/// How many recent games to pull for the scouting panel. Each is a separate
/// (large) match-details fetch, so keep it modest.
const RECENT_COUNT: usize = 5;

/// A player's most recent matches with per-match K/D/A and result. Fetched on
/// demand (clicking a player) since it's several heavy requests.
pub fn fetch_recent(puuid: &str) -> Result<Vec<RecentMatch>, String> {
    let ctx = Ctx::build()?;

    let history = ctx.get(&format!(
        "{}/match-history/v1/history/{}?startIndex=0&endIndex={}",
        ctx.pd(),
        puuid,
        RECENT_COUNT
    ))?;
    let ids: Vec<String> = history["History"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|h| h["MatchID"].as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    let mut out = Vec::new();
    for mid in ids {
        let md = match ctx.get(&format!("{}/match-details/v1/matches/{}", ctx.pd(), mid)) {
            Ok(v) => v,
            Err(_) => continue, // some matches (deathmatch/expired) 404 — skip
        };
        if let Some(m) = parse_match(&md, puuid) {
            out.push(m);
        }
    }
    Ok(out)
}

/// Pull one player's line from a match-details blob.
fn parse_match(md: &serde_json::Value, puuid: &str) -> Option<RecentMatch> {
    let info = &md["matchInfo"];
    let players = md["players"].as_array()?;
    let me = players
        .iter()
        .find(|p| p["subject"].as_str() == Some(puuid))?;

    let team_id = me["teamId"].as_str().unwrap_or("");
    let stats = &me["stats"];

    // Find our team + the opposing team for the round score / result.
    let mut rounds_won = 0;
    let mut rounds_lost = 0;
    let mut won = false;
    if let Some(teams) = md["teams"].as_array() {
        for t in teams {
            let rw = t["roundsWon"].as_i64().unwrap_or(0) as i32;
            if t["teamId"].as_str() == Some(team_id) {
                rounds_won = rw;
                won = t["won"].as_bool().unwrap_or(false);
            } else {
                rounds_lost = rounds_lost.max(rw);
            }
        }
    }

    Some(RecentMatch {
        map: content::map_name(info["mapId"].as_str().unwrap_or("")),
        mode: info["queueId"].as_str().unwrap_or("").to_string(),
        agent: content::agent(me["characterId"].as_str().unwrap_or("")).name,
        kills: stats["kills"].as_i64().unwrap_or(0) as i32,
        deaths: stats["deaths"].as_i64().unwrap_or(0) as i32,
        assists: stats["assists"].as_i64().unwrap_or(0) as i32,
        score: stats["score"].as_i64().unwrap_or(0) as i32,
        won,
        rounds_won,
        rounds_lost,
    })
}
