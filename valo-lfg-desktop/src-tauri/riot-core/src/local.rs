//! The local Riot Client API (lockfile-authenticated localhost server).

use std::path::PathBuf;

use base64::prelude::*;

/// Identity + auth tokens read from the running Riot client.
pub struct Session {
    pub puuid: String,
    pub game_name: String,
    pub tag_line: String,
    pub access_token: String,
    pub entitlement: String,
}

/// The Valorant PVP region ("na") and its data shard ("na").
pub struct Region {
    pub pvp: String,
    pub shard: String,
}

fn lockfile_path() -> PathBuf {
    let base = std::env::var("LOCALAPPDATA").unwrap_or_default();
    PathBuf::from(base).join("Riot Games/Riot Client/Config/lockfile")
}

/// Parse `name:pid:port:password:protocol` -> (port, password).
pub(crate) fn read_lock() -> Result<(u16, String), String> {
    let raw = std::fs::read_to_string(lockfile_path())
        .map_err(|_| "Riot client isn't running (no lockfile).".to_string())?;
    let parts: Vec<&str> = raw.trim().split(':').collect();
    if parts.len() < 5 {
        return Err("Malformed Riot lockfile.".into());
    }
    let port = parts[2].parse::<u16>().map_err(|_| "Bad port in lockfile.".to_string())?;
    Ok((port, parts[3].to_string()))
}

pub(crate) fn basic_auth(password: &str) -> String {
    format!("Basic {}", BASE64_STANDARD.encode(format!("riot:{password}")))
}

fn get_json(
    agent: &ureq::Agent,
    port: u16,
    auth: &str,
    path: &str,
) -> Result<serde_json::Value, String> {
    agent
        .get(&format!("https://127.0.0.1:{port}{path}"))
        .set("Authorization", auth)
        .call()
        .map_err(|e| format!("local API {path} failed: {e}"))?
        .into_json::<serde_json::Value>()
        .map_err(|e| format!("local API {path} bad json: {e}"))
}

/// Pull identity (riot id, puuid) and auth tokens from the local client.
pub fn session(agent: &ureq::Agent) -> Result<Session, String> {
    let (port, password) = read_lock()?;
    let auth = basic_auth(&password);

    let ent = get_json(agent, port, &auth, "/entitlements/v1/token")?;
    let access_token = ent["accessToken"].as_str().unwrap_or_default().to_string();
    let entitlement = ent["token"].as_str().unwrap_or_default().to_string();
    let puuid = ent["subject"].as_str().unwrap_or_default().to_string();
    if access_token.is_empty() || entitlement.is_empty() {
        return Err("Riot client is up but not signed in yet.".into());
    }

    let chat = get_json(agent, port, &auth, "/chat/v1/session")?;
    let game_name = chat["game_name"].as_str().unwrap_or_default().to_string();
    let tag_line = chat["game_tag"].as_str().unwrap_or_default().to_string();

    Ok(Session { puuid, game_name, tag_line, access_token, entitlement })
}

/// Region from the client, mapped to the PVP region + data shard.
pub fn pvp_region(agent: &ureq::Agent) -> Result<Region, String> {
    let (port, password) = read_lock()?;
    let auth = basic_auth(&password);
    let v = get_json(agent, port, &auth, "/riotclient/region-locale")?;
    let raw = v["region"].as_str().unwrap_or("NA").to_lowercase();
    // Most regions: shard == region. LATAM/BR live on the NA shard.
    let (pvp, shard) = match raw.as_str() {
        "latam" | "br" => (raw.clone(), "na".to_string()),
        other => (other.to_string(), other.to_string()),
    };
    Ok(Region { pvp, shard })
}
