use git2::ProxyOptions;
use serde::{Deserialize, Serialize};
use std::sync::{OnceLock, RwLock};

/// How GITBX should connect to HTTP(S) Git remotes.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProxyMode {
    /// Let libgit2 use the configured/system proxy settings.
    #[default]
    System,
    /// Use the server and port configured by the user.
    Custom,
    /// Connect directly, ignoring proxy settings.
    None,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyConfig {
    #[serde(default)]
    pub mode: ProxyMode,
    #[serde(default)]
    pub host: String,
    #[serde(default)]
    pub port: u16,
    #[serde(default)]
    pub auth_enabled: bool,
    #[serde(default)]
    pub username: String,
    /// The password is deliberately not serialized into app-config.json.
    #[serde(skip)]
    pub password: Option<String>,
}

static PROXY_CONFIG: OnceLock<RwLock<ProxyConfig>> = OnceLock::new();

fn proxy_config() -> &'static RwLock<ProxyConfig> {
    PROXY_CONFIG.get_or_init(|| RwLock::new(ProxyConfig::default()))
}

pub fn set_proxy_config(config: ProxyConfig) -> Result<(), String> {
    if config.mode == ProxyMode::Custom {
        if config.host.trim().is_empty() {
            return Err("Proxy server cannot be empty when custom proxy is enabled".into());
        }
        if config.port == 0 {
            return Err("Proxy port must be between 1 and 65535".into());
        }
    }

    *proxy_config()
        .write()
        .map_err(|_| "Proxy configuration lock poisoned".to_string())? = config;
    Ok(())
}

fn percent_encode(value: &str) -> String {
    value
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                (byte as char).to_string()
            }
            _ => format!("%{byte:02X}"),
        })
        .collect()
}

fn custom_proxy_url(config: &ProxyConfig) -> String {
    let host = config
        .host
        .trim()
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .trim_end_matches('/');
    let credentials = if config.auth_enabled && !config.username.trim().is_empty() {
        let password = config.password.as_deref().unwrap_or_default();
        format!(
            "{}:{}@",
            percent_encode(config.username.trim()),
            percent_encode(password)
        )
    } else {
        String::new()
    };
    format!("http://{credentials}{host}:{}", config.port)
}

/// Build options for a single libgit2 network operation.
///
/// The returned options own their URL, so they can safely be passed to the
/// operation without exposing the process-wide configuration lock.
pub fn proxy_options() -> ProxyOptions<'static> {
    let config = proxy_config()
        .read()
        .map(|config| config.clone())
        .unwrap_or_default();
    let mut options = ProxyOptions::new();
    match config.mode {
        ProxyMode::System => {
            options.auto();
        }
        ProxyMode::Custom => {
            options.url(&custom_proxy_url(&config));
        }
        ProxyMode::None => {}
    }
    options
}

#[cfg(test)]
mod tests {
    use super::{custom_proxy_url, ProxyConfig, ProxyMode};

    #[test]
    fn builds_authenticated_custom_proxy_url() {
        let config = ProxyConfig {
            mode: ProxyMode::Custom,
            host: "proxy.example.com".into(),
            port: 8080,
            auth_enabled: true,
            username: "user@example.com".into(),
            password: Some("p@ ss".into()),
        };
        assert_eq!(
            custom_proxy_url(&config),
            "http://user%40example.com:p%40%20ss@proxy.example.com:8080"
        );
    }

    #[test]
    fn does_not_serialize_proxy_password() {
        let config = ProxyConfig {
            mode: ProxyMode::Custom,
            host: "proxy.example.com".into(),
            port: 8080,
            auth_enabled: true,
            username: "user".into(),
            password: Some("secret".into()),
        };
        let value = serde_json::to_value(config).expect("serialize proxy config");
        assert!(value.get("password").is_none());
    }
}
