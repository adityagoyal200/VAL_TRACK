/// Read the signed-in player's identity + current competitive rank.
#[tauri::command]
async fn get_overview() -> Result<riot_core::Overview, String> {
    // Blocking HTTP; async command keeps it off the main (UI) thread.
    tauri::async_runtime::spawn_blocking(riot_core::fetch_overview)
        .await
        .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_overview])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
