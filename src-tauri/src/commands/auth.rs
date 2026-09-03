use gitbx_core::{save_ssh_key_passphrase, KeyringManager};

#[tauri::command]
pub async fn save_credential(
    provider: String,
    username: String,
    token: String,
) -> Result<(), String> {
    KeyringManager::save_token(&provider, &username, &token).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_credential(provider: String, username: String) -> Result<String, String> {
    KeyringManager::get_token(&provider, &username).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn delete_credential(provider: String, username: String) -> Result<(), String> {
    KeyringManager::delete_token(&provider, &username).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn save_ssh_passphrase(key_path: String, passphrase: String) -> Result<String, String> {
    save_ssh_key_passphrase(&key_path, &passphrase).map_err(|error| error.to_string())
}
