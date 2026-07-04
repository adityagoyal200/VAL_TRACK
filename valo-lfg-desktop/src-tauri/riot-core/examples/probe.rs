//! Live smoke test for the Riot client — run with the Riot client open:
//!   cargo run --example probe
fn main() {
    match riot_core::fetch_overview() {
        Ok(o) => println!("OK: {o:#?}"),
        Err(e) => println!("ERR: {e}"),
    }
}
