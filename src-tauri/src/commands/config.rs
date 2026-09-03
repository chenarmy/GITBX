use gitbx_core::{
    path_for_display, set_global_ssh_key, set_proxy_config, KeyringManager, ProxyConfig,
};
use serde_json::Value;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

const CONFIG_DIR_NAME: &str = ".gitbx";
const CONFIG_FILE_NAME: &str = "config.json";

fn config_path() -> Result<PathBuf, String> {
    let home =
        dirs::home_dir().ok_or_else(|| "Unable to locate the user home directory".to_string())?;
    Ok(home.join(CONFIG_DIR_NAME).join(CONFIG_FILE_NAME))
}

fn read_config(path: &Path) -> Result<Option<Value>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(path).map_err(|error| {
        format!(
            "Failed to read configuration at {}: {error}",
            path.display()
        )
    })?;
    serde_json::from_str(&content)
        .map(Some)
        .map_err(|error| format!("Invalid configuration at {}: {error}", path.display()))
}

fn write_config(path: &Path, config: &Value) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Configuration path has no parent directory".to_string())?;
    fs::create_dir_all(parent).map_err(|error| {
        format!(
            "Failed to create configuration directory {}: {error}",
            parent.display()
        )
    })?;

    let content = serde_json::to_vec_pretty(config)
        .map_err(|error| format!("Failed to serialize configuration: {error}"))?;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(path)
        .map_err(|error| {
            format!(
                "Failed to open configuration at {}: {error}",
                path.display()
            )
        })?;
    file.write_all(&content).map_err(|error| {
        format!(
            "Failed to write configuration at {}: {error}",
            path.display()
        )
    })?;
    file.sync_all().map_err(|error| {
        format!(
            "Failed to flush configuration at {}: {error}",
            path.display()
        )
    })
}

fn apply_proxy_config(config: &Value) -> Result<(), String> {
    let proxy_value = config
        .get("settings")
        .and_then(|settings| settings.get("proxy"))
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}));
    let mut proxy: ProxyConfig = serde_json::from_value(proxy_value)
        .map_err(|error| format!("Invalid proxy configuration: {error}"))?;
    if proxy.auth_enabled {
        proxy.password = KeyringManager::get_token("proxy", "default").ok();
    }
    set_proxy_config(proxy)
}

fn apply_ssh_config(config: &Value) -> Result<(), String> {
    let key_path = config
        .get("settings")
        .and_then(|settings| settings.get("sshKey"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty());
    set_global_ssh_key(key_path).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn load_app_config() -> Result<Option<Value>, String> {
    let config = read_config(&config_path()?)?;
    if let Some(ref config) = config {
        apply_proxy_config(config)?;
        apply_ssh_config(config)?;
    }
    Ok(config)
}

#[tauri::command]
pub async fn save_app_config(config: Value) -> Result<String, String> {
    apply_proxy_config(&config)?;
    apply_ssh_config(&config)?;
    let path = config_path()?;
    write_config(&path, &config)?;
    Ok(path_for_display(&path))
}

#[tauri::command]
pub async fn get_app_config_path() -> Result<String, String> {
    Ok(path_for_display(&config_path()?))
}

#[cfg(test)]
mod tests {
    use super::{read_config, write_config};
    use serde_json::json;
    use tempfile::tempdir;

    #[test]
    fn writes_and_reads_configuration() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join(".gitbx").join("config.json");
        let expected = json!({
            "version": 1,
            "settings": { "theme": "dark" },
            "repositories": { "active": "C:\\repo" }
        });

        write_config(&path, &expected).expect("write config");
        assert_eq!(read_config(&path).expect("read config"), Some(expected));
    }
}
