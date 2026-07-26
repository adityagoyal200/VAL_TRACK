//! Valorant PVP endpoints (competitive rank). Requires the local session tokens.

use base64::prelude::*;

use super::local::Session;

/// A fixed client-platform token every PVP request must carry.
pub fn client_platform() -> String {
    let json = r#"{"platformType":"PC","platformOS":"Windows","platformOSVersion":"10.0.19042.1.256.64bit","platformChipset":"Unknown"}"#;
    BASE64_STANDARD.encode(json)
}

/// Attach the four headers every authenticated PVP/GLZ request needs.
pub fn authed<'a>(
    agent: &'a ureq::Agent,
    method: &str,
    url: &str,
    session: &Session,
    version: &str,
) -> ureq::Request {
    agent
        .request(method, url)
        .set("Authorization", &format!("Bearer {}", session.access_token))
        .set("X-Riot-Entitlements-JWT", &session.entitlement)
        .set("X-Riot-ClientPlatform", &client_platform())
        .set("X-Riot-ClientVersion", version)
}

/// Authenticated GET returning parsed JSON.
pub fn pvp_get(
    agent: &ureq::Agent,
    url: &str,
    session: &Session,
    version: &str,
) -> Result<serde_json::Value, String> {
    authed(agent, "GET", url, session, version)
        .call()
        .map_err(|e| format!("GET {url} failed: {e}"))?
        .into_json::<serde_json::Value>()
        .map_err(|e| format!("GET {url} bad json: {e}"))
}

/// Authenticated GET that treats 404 as "not applicable" (`Ok(None)`), so the
/// caller can probe phase endpoints (in-game / agent-select) without erroring.
pub fn pvp_get_opt(
    agent: &ureq::Agent,
    url: &str,
    session: &Session,
    version: &str,
) -> Result<Option<serde_json::Value>, String> {
    match authed(agent, "GET", url, session, version).call() {
        Ok(resp) => resp
            .into_json::<serde_json::Value>()
            .map(Some)
            .map_err(|e| format!("GET {url} bad json: {e}")),
        Err(ureq::Error::Status(404, _)) => Ok(None),
        Err(e) => Err(format!("GET {url} failed: {e}")),
    }
}

/// Authenticated PUT with a JSON body, returning parsed JSON.
pub fn pvp_put(
    agent: &ureq::Agent,
    url: &str,
    body: &serde_json::Value,
    session: &Session,
    version: &str,
) -> Result<serde_json::Value, String> {
    authed(agent, "PUT", url, session, version)
        .send_json(body)
        .map_err(|e| format!("PUT {url} failed: {e}"))?
        .into_json::<serde_json::Value>()
        .map_err(|e| format!("PUT {url} bad json: {e}"))
}

/// Current Riot client version, needed as the X-Riot-ClientVersion header.
pub fn client_version(agent: &ureq::Agent) -> Result<String, String> {
    let v = agent
        .get("https://valorant-api.com/v1/version")
        .call()
        .map_err(|e| format!("version fetch failed: {e}"))?
        .into_json::<serde_json::Value>()
        .map_err(|e| format!("version bad json: {e}"))?;
    v["data"]["riotClientVersion"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| "no riotClientVersion in response".into())
}

#[derive(Clone, Copy)]
pub struct Rank {
    pub tier: u8,
    pub rr: i32,
}

/// Latest competitive tier + RR from the player's most recent ranked update.
pub fn current_rank(
    agent: &ureq::Agent,
    shard: &str,
    session: &Session,
    version: &str,
) -> Result<Rank, String> {
    let url = format!(
        "https://pd.{shard}.a.pvp.net/mmr/v1/players/{}/competitiveupdates?startIndex=0&endIndex=1&queue=competitive",
        session.puuid
    );
    let v = pvp_get(agent, &url, session, version)?;

    let matches = v["Matches"].as_array().cloned().unwrap_or_default();
    let latest = matches
        .into_iter()
        .find(|m| m["TierAfterUpdate"].as_i64().is_some())
        .ok_or_else(|| "no ranked matches this act".to_string())?;

    Ok(Rank {
        tier: latest["TierAfterUpdate"].as_i64().unwrap_or(0) as u8,
        rr: latest["RankedRatingAfterUpdate"].as_i64().unwrap_or(0) as i32,
    })
}

/// Scouting stats for a player in your match: current rank, peak rank, and
/// this-act win/loss — all from a single MMR record.
#[derive(Clone, Copy, Default)]
pub struct PlayerStats {
    pub tier: u8,
    pub rr: i32,
    pub peak_tier: u8,
    pub wins: i32,
    pub games: i32,
}

/// Read a player's MMR record and distill it to scouting stats. Returns an
/// all-zero record when the player has no ranked history or their MMR is
/// hidden — never fails the whole roster.
pub fn player_stats(
    agent: &ureq::Agent,
    shard: &str,
    puuid: &str,
    session: &Session,
    version: &str,
) -> PlayerStats {
    let url = format!("https://pd.{shard}.a.pvp.net/mmr/v1/players/{puuid}");
    let v = match pvp_get(agent, &url, session, version) {
        Ok(v) => v,
        Err(_) => return PlayerStats::default(),
    };

    let latest = &v["LatestCompetitiveUpdate"];
    let tier = latest["TierAfterUpdate"].as_i64().unwrap_or(0) as u8;
    let rr = latest["RankedRatingAfterUpdate"].as_i64().unwrap_or(0) as i32;
    let cur_season = latest["SeasonID"].as_str().unwrap_or("");

    // Peak tier = highest CompetitiveTier ever; this-act W/L from the season
    // matching the latest ranked game.
    let mut peak_tier = tier;
    let (mut wins, mut games) = (0, 0);
    if let Some(seasons) = v["QueueSkills"]["competitive"]["SeasonalInfoBySeason"].as_object() {
        for (sid, s) in seasons {
            let t = s["CompetitiveTier"].as_i64().unwrap_or(0) as u8;
            if t > peak_tier {
                peak_tier = t;
            }
            if sid == cur_season {
                wins = s["NumberOfWins"].as_i64().unwrap_or(0) as i32;
                games = s["NumberOfGames"].as_i64().unwrap_or(0) as i32;
            }
        }
    }

    PlayerStats { tier, rr, peak_tier, wins, games }
}
