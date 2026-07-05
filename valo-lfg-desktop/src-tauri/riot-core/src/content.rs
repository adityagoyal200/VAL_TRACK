//! Static game content (agents, weapon skins) resolved from valorant-api.com.
//!
//! UUIDs returned by the live client mean nothing to a human — this maps them
//! to display names + CDN icon URLs. Fetched once and cached for the process;
//! this content only changes on a game patch.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

#[derive(Clone)]
pub struct AgentInfo {
    pub name: String,
    pub icon: String,
}

#[derive(Clone)]
pub struct SkinInfo {
    pub name: String,
    pub icon: String,
}

#[derive(Default)]
struct Content {
    agents: HashMap<String, AgentInfo>,
    skins: HashMap<String, SkinInfo>,
    weapons: HashMap<String, String>,
    maps: HashMap<String, String>,
    loaded: bool,
}

fn cache() -> &'static Mutex<Content> {
    static C: OnceLock<Mutex<Content>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(Content::default()))
}

fn get_json(agent: &ureq::Agent, url: &str) -> Option<serde_json::Value> {
    agent.get(url).call().ok()?.into_json().ok()
}

/// Fetch + cache the agent and skin tables if we haven't already. Best-effort:
/// a failed fetch just leaves the maps empty so lookups fall back to defaults.
fn ensure_loaded() {
    let mut c = cache().lock().unwrap();
    if c.loaded {
        return;
    }
    // Mark loaded up-front: even on network failure we don't want to hammer
    // valorant-api on every roster poll.
    c.loaded = true;

    let agent = super::strict_agent();

    if let Some(v) = get_json(&agent, "https://valorant-api.com/v1/agents?isPlayableCharacter=true") {
        if let Some(arr) = v["data"].as_array() {
            for a in arr {
                if let Some(uuid) = a["uuid"].as_str() {
                    c.agents.insert(
                        uuid.to_lowercase(),
                        AgentInfo {
                            name: a["displayName"].as_str().unwrap_or("Unknown").to_string(),
                            icon: a["displayIcon"].as_str().unwrap_or_default().to_string(),
                        },
                    );
                }
            }
        }
    }

    if let Some(v) = get_json(&agent, "https://valorant-api.com/v1/maps") {
        if let Some(arr) = v["data"].as_array() {
            for m in arr {
                // matchInfo.mapId is the internal path ("mapUrl"), not the uuid.
                if let Some(url) = m["mapUrl"].as_str() {
                    c.maps.insert(
                        url.to_lowercase(),
                        m["displayName"].as_str().unwrap_or("Unknown").to_string(),
                    );
                }
            }
        }
    }

    if let Some(v) = get_json(&agent, "https://valorant-api.com/v1/weapons") {
        if let Some(weapons) = v["data"].as_array() {
            for w in weapons {
                if let Some(wu) = w["uuid"].as_str() {
                    c.weapons.insert(
                        wu.to_lowercase(),
                        w["displayName"].as_str().unwrap_or("Weapon").to_string(),
                    );
                }
                let Some(skins) = w["skins"].as_array() else { continue };
                for s in skins {
                    let Some(uuid) = s["uuid"].as_str() else { continue };
                    // Base skins often have a null displayIcon (e.g. the default
                    // "Standard" skin); fall back to a chroma / level render.
                    let icon = s["displayIcon"]
                        .as_str()
                        .or_else(|| s["chromas"][0]["fullRender"].as_str())
                        .or_else(|| s["chromas"][0]["displayIcon"].as_str())
                        .or_else(|| s["levels"][0]["displayIcon"].as_str())
                        .unwrap_or_default()
                        .to_string();
                    c.skins.insert(
                        uuid.to_lowercase(),
                        SkinInfo {
                            name: s["displayName"].as_str().unwrap_or("Unknown").to_string(),
                            icon,
                        },
                    );
                }
            }
        }
    }
}

/// Agent display name + icon for a CharacterID.
pub fn agent(uuid: &str) -> AgentInfo {
    ensure_loaded();
    cache()
        .lock()
        .unwrap()
        .agents
        .get(&uuid.to_lowercase())
        .cloned()
        .unwrap_or(AgentInfo {
            name: "—".to_string(),
            icon: String::new(),
        })
}

/// Weapon-skin display name + icon for a skin UUID.
pub fn skin(uuid: &str) -> SkinInfo {
    ensure_loaded();
    cache()
        .lock()
        .unwrap()
        .skins
        .get(&uuid.to_lowercase())
        .cloned()
        .unwrap_or(SkinInfo {
            name: "Standard".to_string(),
            icon: String::new(),
        })
}

/// Weapon display name (e.g. "Vandal") for a weapon UUID.
pub fn weapon_name(uuid: &str) -> String {
    ensure_loaded();
    cache()
        .lock()
        .unwrap()
        .weapons
        .get(&uuid.to_lowercase())
        .cloned()
        .unwrap_or_else(|| "Weapon".to_string())
}

/// Map display name (e.g. "Ascent") for a map path (matchInfo.mapId).
pub fn map_name(path: &str) -> String {
    ensure_loaded();
    cache()
        .lock()
        .unwrap()
        .maps
        .get(&path.to_lowercase())
        .cloned()
        .unwrap_or_else(|| "Unknown".to_string())
}
