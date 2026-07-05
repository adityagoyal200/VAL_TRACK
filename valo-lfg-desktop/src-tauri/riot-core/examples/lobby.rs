//! Live smoke test for the lobby roster — run with the Riot client open
//! (ideally while in agent-select or a match):
//!   cargo run --example lobby
//!
//! Optionally pass a puuid to also dump that player's weapon loadout:
//!   cargo run --example lobby -- <puuid>
fn main() {
    match riot_core::match_state::fetch_lobby() {
        Ok(lobby) => {
            println!("PHASE: {}  match={}  loadouts={}", lobby.phase, lobby.match_id, lobby.has_loadouts);
            for p in &lobby.players {
                let me = if p.is_self { "*" } else { " " };
                println!(
                    "{me} [{:<5}] {:<16} {:<12} {:<14} {} RR  lvl {}",
                    p.team,
                    format!("{}#{}", p.name, p.tag),
                    p.agent,
                    p.tier_name,
                    p.rr,
                    p.level,
                );
            }
        }
        Err(e) => println!("LOBBY ERR: {e}"),
    }

    if let Some(puuid) = std::env::args().nth(1) {
        println!("\n-- loadout for {puuid} --");
        match riot_core::match_state::fetch_loadout(&puuid) {
            Ok(skins) => {
                for s in skins {
                    println!("  {:<14} {}", s.weapon, s.skin);
                }
            }
            Err(e) => println!("LOADOUT ERR: {e}"),
        }
    }
}
