//! Valorant PVP endpoints (competitive rank). Requires the local session tokens.

use base64::prelude::*;

use super::local::Session;

/// A fixed client-platform token every PVP request must carry.
fn client_platform() -> String {
    let json = r#"{"platformType":"PC","platformOS":"Windows","platformOSVersion":"10.0.19042.1.256.64bit","platformChipset":"Unknown"}"#;
    BASE64_STANDARD.encode(json)
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
    let v = agent
        .get(&url)
        .set("Authorization", &format!("Bearer {}", session.access_token))
        .set("X-Riot-Entitlements-JWT", &session.entitlement)
        .set("X-Riot-ClientPlatform", &client_platform())
        .set("X-Riot-ClientVersion", version)
        .call()
        .map_err(|e| format!("mmr fetch failed: {e}"))?
        .into_json::<serde_json::Value>()
        .map_err(|e| format!("mmr bad json: {e}"))?;

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
