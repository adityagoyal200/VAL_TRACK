/// Read the signed-in player's identity + current competitive rank.
#[tauri::command]
async fn get_overview() -> Result<riot_core::Overview, String> {
    // Blocking HTTP; async command keeps it off the main (UI) thread.
    tauri::async_runtime::spawn_blocking(riot_core::fetch_overview)
        .await
        .map_err(|e| e.to_string())?
}

/// The current lobby / match roster: every player, their agent and rank.
#[tauri::command]
async fn get_lobby() -> Result<riot_core::match_state::Lobby, String> {
    tauri::async_runtime::spawn_blocking(riot_core::match_state::fetch_lobby)
        .await
        .map_err(|e| e.to_string())?
}

/// One player's equipped weapon skins in the current live match.
#[tauri::command]
async fn get_player_loadout(puuid: String) -> Result<Vec<riot_core::match_state::WeaponSkin>, String> {
    tauri::async_runtime::spawn_blocking(move || riot_core::match_state::fetch_loadout(&puuid))
        .await
        .map_err(|e| e.to_string())?
}

/// A player's recent matches (K/D/A + result) for the scouting panel.
#[tauri::command]
async fn get_player_matches(puuid: String) -> Result<Vec<riot_core::match_state::RecentMatch>, String> {
    tauri::async_runtime::spawn_blocking(move || riot_core::match_state::fetch_recent(&puuid))
        .await
        .map_err(|e| e.to_string())?
}

/// Push the signed-in player's owned skins to the Valo LFG backend using a
/// pairing code from the website. Returns how many skins were synced.
#[tauri::command]
async fn sync_skins(code: String) -> Result<usize, String> {
    let backend = std::env::var("VALO_LFG_API").unwrap_or_else(|_| "http://localhost:8000".into());
    tauri::async_runtime::spawn_blocking(move || {
        riot_core::collection::sync_collection(&backend, code.trim())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri::Emitter;

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Watch the local client's event websocket; every relevant event
            // nudges the UI to refetch the roster — instant, no polling lag.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                riot_core::events::watch(|| {
                    let _ = handle.emit("lobby-changed", ());
                });
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_overview,
            get_lobby,
            get_player_loadout,
            get_player_matches,
            sync_skins
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
