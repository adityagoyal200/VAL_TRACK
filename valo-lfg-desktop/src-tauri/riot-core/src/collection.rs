//! Owned weapon-skin sync: read skin-level entitlements from the PVP store
//! API (the only place ownership exists) and push the raw uuids to the Valo
//! LFG backend using a short-lived pairing code minted on the website.

use crate::{local, local_agent, pvp, strict_agent};

/// Riot's item-type id for weapon-skin levels in the entitlements store.
const SKIN_LEVEL_TYPE: &str = "e7c63390-eda7-46e0-bb7a-a6abdacd2433";

/// Every skin-level uuid the signed-in player owns.
pub fn fetch_owned_skin_levels() -> Result<Vec<String>, String> {
    let local = local_agent();
    let session = local::session(&local)?;
    let region = local::pvp_region(&local)?;

    let strict = strict_agent();
    let version = pvp::client_version(&strict)?;
    let url = format!(
        "https://pd.{}.a.pvp.net/store/v1/entitlements/{}/{SKIN_LEVEL_TYPE}",
        region.shard, session.puuid
    );
    let v = pvp::pvp_get(&strict, &url, &session, &version)?;

    let items = v["Entitlements"]
        .as_array()
        .ok_or_else(|| "entitlements response missing `Entitlements`".to_string())?
        .iter()
        .filter_map(|e| e["ItemID"].as_str().map(String::from))
        .collect();
    Ok(items)
}

/// POST the collection to the backend. `code` is the one-time pairing code
/// the user generated on the website; the backend maps it to their account.
pub fn push_collection(backend_url: &str, code: &str, levels: &[String]) -> Result<usize, String> {
    let url = format!("{}/api/tracker/collection/upload/", backend_url.trim_end_matches('/'));
    let body = serde_json::json!({ "code": code, "skin_levels": levels });
    let resp = strict_agent()
        .post(&url)
        .send_json(&body)
        .map_err(|e| match e {
            ureq::Error::Status(403, _) => {
                "That sync code is invalid or expired — generate a fresh one on the website.".into()
            }
            other => format!("upload failed: {other}"),
        })?;
    let v: serde_json::Value = resp
        .into_json()
        .map_err(|e| format!("upload response bad json: {e}"))?;
    Ok(v["count"].as_u64().unwrap_or(levels.len() as u64) as usize)
}

/// Fetch + push in one step: what the UI's Sync button calls.
pub fn sync_collection(backend_url: &str, code: &str) -> Result<usize, String> {
    let levels = fetch_owned_skin_levels()?;
    if levels.is_empty() {
        return Err("No owned skins found — is VALORANT running and signed in?".into());
    }
    push_collection(backend_url, code, &levels)
}
