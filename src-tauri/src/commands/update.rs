use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

const RELEASE_PREFIX: &str = "https://github.com/chenarmy/GITBX/releases/";

#[tauri::command]
pub async fn open_release_url(app: AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with(RELEASE_PREFIX) {
        return Err("Only official GITBX release URLs can be opened".to_string());
    }

    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| format!("Failed to open release page: {error}"))
}
