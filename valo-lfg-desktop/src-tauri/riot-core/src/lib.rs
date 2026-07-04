//! Read-only client for the local Riot client API + Valorant PVP endpoints.
//!
//! Pipeline: lockfile -> local API (tokens, identity, region) -> PVP MMR.
//! Strictly read-only. Uses the OS TLS stack (SChannel via native-tls).

pub mod local;
pub mod pvp;
pub mod tiers;

use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;

/// A ureq agent that trusts the Riot client's self-signed localhost cert.
pub fn local_agent() -> ureq::Agent {
    let connector = native_tls::TlsConnector::builder()
        .danger_accept_invalid_certs(true)
        .build()
        .expect("build local tls connector");
    ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(6))
        .tls_connector(Arc::new(connector))
        .build()
}

/// A normal agent (full cert verification) for public Riot/PVP servers.
pub fn strict_agent() -> ureq::Agent {
    // With default features off, ureq has no implicit TLS backend — pass the
    // OS-native (SChannel) connector explicitly, full cert verification.
    let connector = native_tls::TlsConnector::new().expect("build tls connector");
    ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(8))
        .tls_connector(Arc::new(connector))
        .build()
}

/// The at-a-glance card the first UI slice renders.
#[derive(Debug, Serialize)]
pub struct Overview {
    pub riot_id: String,
    pub game_name: String,
    pub tag_line: String,
    pub region: String,
    pub tier: u8,
    pub tier_name: String,
    pub rr: i32,
}

/// Full read: local identity + current competitive rank.
pub fn fetch_overview() -> Result<Overview, String> {
    let local = local_agent();
    let session = local::session(&local)?;
    let region = local::pvp_region(&local)?;

    let strict = strict_agent();
    let version = pvp::client_version(&strict)?;
    let rank = pvp::current_rank(&strict, &region.shard, &session, &version)
        .unwrap_or(pvp::Rank { tier: 0, rr: 0 });

    Ok(Overview {
        riot_id: format!("{}#{}", session.game_name, session.tag_line),
        game_name: session.game_name,
        tag_line: session.tag_line,
        region: region.pvp.to_uppercase(),
        tier: rank.tier,
        tier_name: tiers::tier_name(rank.tier),
        rr: rank.rr,
    })
}
