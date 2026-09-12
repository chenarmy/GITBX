use crate::error::Result;
use crate::process::create_git_command;
use crate::proxy_options;
use crate::repository::Repository;
use crate::ssh::{
    configure_git_ssh, configured_ssh_key, passphrase_for, public_key_for,
    REPOSITORY_SSH_KEY_CONFIG,
};
use git2::{ConfigLevel, Cred, CredentialType, Error, FetchOptions, PushOptions, RemoteCallbacks};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteItem {
    pub name: String,
    pub url: Option<String>,
    pub push_url: Option<String>,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct ParsedGitUrl {
    pub protocol: String,
    pub host: String,
    pub path: Option<String>,
    pub username: Option<String>,
}

pub(crate) fn parse_git_url(raw: &str) -> Option<ParsedGitUrl> {
    let (protocol, rest) = if let Some(stripped) = raw.strip_prefix("https://") {
        ("https", stripped)
    } else if let Some(stripped) = raw.strip_prefix("http://") {
        ("http", stripped)
    } else {
        return None;
    };

    let (user_host, path) = match rest.split_once('/') {
        Some((uh, p)) => (uh, Some(p.to_string())),
        None => (rest, None),
    };

    let (username, host) = match user_host.split_once('@') {
        Some((u, h)) => {
            let user = if let Some((u, _pass)) = u.split_once(':') {
                u
            } else {
                u
            };
            (Some(user.to_string()), h)
        }
        None => (None, user_host),
    };

    if host.is_empty() {
        return None;
    }

    Some(ParsedGitUrl {
        protocol: protocol.to_string(),
        host: host.to_string(),
        path,
        username,
    })
}

fn find_credentials_with_helper(
    repo_path: Option<&std::path::Path>,
    url: &str,
    username_from_url: Option<&str>,
) -> Option<Cred> {
    let parsed = parse_git_url(url)?;
    let mut command = create_git_command();
    if let Some(path) = repo_path {
        command.current_dir(path);
    }
    command.args(["credential", "fill"]);
    command.stdin(std::process::Stdio::piped());
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    let mut child = command.spawn().ok()?;
    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        let _ = writeln!(stdin, "protocol={}", parsed.protocol);
        let _ = writeln!(stdin, "host={}", parsed.host);
        if let Some(ref path) = parsed.path {
            let _ = writeln!(stdin, "path={}", path);
        }
        let username = username_from_url
            .filter(|u| !u.is_empty())
            .or(parsed.username.as_deref());
        if let Some(user) = username {
            let _ = writeln!(stdin, "username={}", user);
        }
        let _ = writeln!(stdin);
    }

    let output = child.wait_with_output().ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut found_username = None;
    let mut found_password = None;
    for line in stdout.lines() {
        let line = line.trim();
        if let Some(val) = line.strip_prefix("username=") {
            found_username = Some(val.to_string());
        } else if let Some(val) = line.strip_prefix("password=") {
            found_password = Some(val.to_string());
        }
    }

    if let (Some(u), Some(p)) = (found_username, found_password) {
        if !p.is_empty() {
            return Cred::userpass_plaintext(&u, &p).ok();
        }
    }
    None
}

pub fn authenticated_remote_callbacks(
    config: Option<git2::Config>,
    repo_path: Option<std::path::PathBuf>,
) -> Result<RemoteCallbacks<'static>> {
    let configured_key = configured_ssh_key(config.as_ref())?;
    let configured_passphrase = configured_key.as_deref().and_then(passphrase_for);
    let mut callbacks = RemoteCallbacks::new();
    callbacks.credentials(
        move |url: &str, username_from_url: Option<&str>, allowed: CredentialType| {
            if allowed.is_user_pass_plaintext() {
                if let Some(credential) =
                    find_credentials_with_helper(repo_path.as_deref(), url, username_from_url)
                {
                    return Ok(credential);
                }
            }

            if allowed.is_ssh_key() {
                let user = username_from_url.unwrap_or("git");
                if let Some(ref private_key) = configured_key {
                    let public_key = public_key_for(private_key);
                    return Cred::ssh_key(
                        user,
                        public_key.as_deref(),
                        private_key,
                        configured_passphrase.as_deref(),
                    );
                }
                if let Ok(credential) = Cred::ssh_key_from_agent(user) {
                    return Ok(credential);
                }

                let home = std::env::var("USERPROFILE")
                    .or_else(|_| std::env::var("HOME"))
                    .map(std::path::PathBuf::from);
                if let Ok(home_path) = home {
                    let ssh_dir = home_path.join(".ssh");
                    for key_name in &["id_ed25519", "id_rsa", "id_ecdsa", "id_dsa", "identity"] {
                        let priv_key = ssh_dir.join(key_name);
                        if priv_key.exists() {
                            let pub_key = ssh_dir.join(format!("{key_name}.pub"));
                            let pub_key_ref = if pub_key.exists() {
                                Some(pub_key.as_path())
                            } else {
                                None
                            };
                            if let Ok(cred) = Cred::ssh_key(user, pub_key_ref, &priv_key, None) {
                                return Ok(cred);
                            }
                        }
                    }
                }
            }

            if allowed.is_default() {
                if let Ok(credential) = Cred::default() {
                    return Ok(credential);
                }
            }

            if allowed.is_username() {
                return Cred::username(username_from_url.unwrap_or("git"));
            }

            Err(Error::from_str(
                "no supported credentials were found in Git Credential Manager or SSH agent",
            ))
        },
    );
    Ok(callbacks)
}

impl Repository {
    fn authenticated_callbacks(&self) -> Result<RemoteCallbacks<'static>> {
        authenticated_remote_callbacks(
            self.inner().config().ok(),
            Some(self.path().to_path_buf()),
        )
    }

    pub fn list_remotes(&self) -> Result<Vec<RemoteItem>> {
        let remotes = self.inner().remotes()?;
        let mut list = Vec::new();

        for name in remotes.iter().flatten() {
            if let Ok(remote) = self.inner().find_remote(name) {
                list.push(RemoteItem {
                    name: name.to_string(),
                    url: remote.url().map(|s| s.to_string()),
                    push_url: remote.pushurl().map(|s| s.to_string()),
                });
            }
        }

        Ok(list)
    }

    pub fn repository_ssh_key(&self) -> Result<Option<String>> {
        let config = self.inner().config()?.open_level(ConfigLevel::Local)?;
        Ok(config.get_string(REPOSITORY_SSH_KEY_CONFIG).ok())
    }

    pub fn set_repository_ssh_key(&self, key_path: Option<&str>) -> Result<()> {
        let mut config = self.inner().config()?.open_level(ConfigLevel::Local)?;
        match key_path.map(str::trim).filter(|value| !value.is_empty()) {
            Some(value) => {
                let path = std::path::Path::new(value);
                if !path.is_file() {
                    return Err(crate::error::GitbxError::General(format!(
                        "SSH private key does not exist: {}",
                        path.display()
                    )));
                }
                let canonical = std::fs::canonicalize(path)?;
                config.set_str(
                    REPOSITORY_SSH_KEY_CONFIG,
                    &crate::path_for_display(&canonical),
                )?;
            }
            None => {
                if config.get_string(REPOSITORY_SSH_KEY_CONFIG).is_ok() {
                    config.remove(REPOSITORY_SSH_KEY_CONFIG)?;
                }
            }
        }
        Ok(())
    }

    pub fn set_remote_urls(&self, name: &str, url: &str, push_url: Option<&str>) -> Result<()> {
        let name = name.trim();
        let url = url.trim();
        if name.is_empty() {
            return Err(crate::error::GitbxError::General(
                "Remote name cannot be empty".into(),
            ));
        }
        if url.is_empty() {
            return Err(crate::error::GitbxError::General(
                "Remote URL cannot be empty".into(),
            ));
        }

        self.inner().remote_set_url(name, url)?;
        let push_url = push_url.map(str::trim).filter(|value| !value.is_empty());
        self.inner().remote_set_pushurl(name, push_url)?;
        Ok(())
    }

    pub fn fetch_remote(&self, remote_name: &str) -> Result<()> {
        let mut remote = self.inner().find_remote(remote_name)?;
        let mut fetch_opts = FetchOptions::new();
        fetch_opts.remote_callbacks(self.authenticated_callbacks()?);
        fetch_opts.proxy_options(proxy_options());

        if let Err(err) = remote.fetch(&[] as &[&str], Some(&mut fetch_opts), None) {
            let mut command = create_git_command();
            let config = self.inner().config().ok();
            configure_git_ssh(&mut command, config.as_ref())?;
            if let Ok(output) = command
                .current_dir(self.path())
                .args(["fetch", remote_name])
                .output()
            {
                if output.status.success() {
                    return Ok(());
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    let detail = if !stderr.is_empty() { stderr } else { stdout };
                    if !detail.is_empty() {
                        return Err(crate::error::GitbxError::General(detail));
                    }
                }
            }
            return Err(err.into());
        }
        Ok(())
    }

    pub fn fetch_all(&self) -> Result<()> {
        for remote in self.inner().remotes()?.iter().flatten() {
            self.fetch_remote(remote)?;
        }
        Ok(())
    }

    pub fn push_current(&self, remote_name: &str) -> Result<()> {
        let branch = self
            .inner()
            .head()?
            .shorthand()
            .ok_or_else(|| crate::error::GitbxError::General("HEAD is detached".into()))?
            .to_string();
        let mut remote = self.inner().find_remote(remote_name)?;
        let refspec = format!("refs/heads/{branch}:refs/heads/{branch}");
        let mut options = PushOptions::new();
        options.remote_callbacks(self.authenticated_callbacks()?);
        options.proxy_options(proxy_options());

        if let Err(error) = remote.push(&[refspec.as_str()], Some(&mut options)) {
            // Fallback to system git CLI push if available
            let mut command = create_git_command();
            let config = self.inner().config().ok();
            configure_git_ssh(&mut command, config.as_ref())?;
            if let Ok(output) = command
                .current_dir(self.path())
                .args(["push", remote_name, &branch])
                .output()
            {
                if output.status.success() {
                    return Ok(());
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    let detail = if !stderr.is_empty() { stderr } else { stdout };
                    if !detail.is_empty() {
                        let lower = detail.to_ascii_lowercase();
                        if lower.contains("permission to")
                            || lower.contains("authentication failed")
                            || lower.contains("denied")
                        {
                            return Err(crate::error::GitbxError::AuthFailed(detail));
                        }
                        return Err(crate::error::GitbxError::General(detail));
                    }
                }
            }

            let message = error.message().to_ascii_lowercase();
            if message.contains("401")
                || message.contains("403")
                || message.contains("authentication")
                || message.contains("credentials")
            {
                return Err(crate::error::GitbxError::AuthFailed(
                    "Remote rejected the Git credentials. Sign in with Git Credential Manager or configure an SSH key, then retry Push."
                        .into(),
                ));
            }
            return Err(error.into());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use crate::repository::Repository;
    use tempfile::tempdir;

    #[test]
    fn updates_and_clears_remote_urls() {
        let dir = tempdir().expect("tempdir");
        let repo = Repository::init(dir.path(), false).expect("init repository");
        repo.inner()
            .remote("origin", "https://example.com/old.git")
            .expect("create remote");

        repo.set_remote_urls(
            " origin ",
            " https://example.com/new.git ",
            Some(" ssh://git@example.com/new.git "),
        )
        .expect("update remote URLs");

        let remote = repo.inner().find_remote("origin").expect("find remote");
        assert_eq!(remote.url(), Some("https://example.com/new.git"));
        assert_eq!(remote.pushurl(), Some("ssh://git@example.com/new.git"));
        drop(remote);

        repo.set_remote_urls("origin", "https://example.com/new.git", Some("  "))
            .expect("clear push URL");
        let remote = repo.inner().find_remote("origin").expect("find remote");
        assert_eq!(remote.pushurl(), None);
    }

    #[test]
    fn rejects_empty_remote_name_and_url() {
        let dir = tempdir().expect("tempdir");
        let repo = Repository::init(dir.path(), false).expect("init repository");
        assert!(repo
            .set_remote_urls(" ", "https://example.com/repo.git", None)
            .is_err());
        assert!(repo.set_remote_urls("origin", " ", None).is_err());
    }

    #[test]
    fn stores_repository_ssh_key_in_local_config() {
        let dir = tempdir().expect("tempdir");
        let repo = Repository::init(dir.path(), false).expect("init repository");
        let private_key = dir.path().join("id_ed25519");
        std::fs::write(&private_key, "private key").expect("write private key");

        repo.set_repository_ssh_key(private_key.to_str())
            .expect("set key");
        assert_eq!(
            repo.repository_ssh_key().expect("read key"),
            Some(crate::path_for_display(
                &std::fs::canonicalize(&private_key).expect("canonical key")
            ))
        );

        repo.set_repository_ssh_key(None).expect("clear key");
        assert_eq!(repo.repository_ssh_key().expect("read cleared key"), None);
    }

    #[test]
    fn parses_git_urls_accurately() {
        use super::{parse_git_url, ParsedGitUrl};

        let parsed = parse_git_url("https://github.com/chenarmy/GITBX.git").expect("parse url");
        assert_eq!(
            parsed,
            ParsedGitUrl {
                protocol: "https".to_string(),
                host: "github.com".to_string(),
                path: Some("chenarmy/GITBX.git".to_string()),
                username: None,
            }
        );

        let parsed_with_user =
            parse_git_url("https://user123@gitlab.com/team/repo.git").expect("parse url");
        assert_eq!(
            parsed_with_user,
            ParsedGitUrl {
                protocol: "https".to_string(),
                host: "gitlab.com".to_string(),
                path: Some("team/repo.git".to_string()),
                username: Some("user123".to_string()),
            }
        );

        let parsed_http_port =
            parse_git_url("http://192.168.1.100:8080/org/project").expect("parse url");
        assert_eq!(
            parsed_http_port,
            ParsedGitUrl {
                protocol: "http".to_string(),
                host: "192.168.1.100:8080".to_string(),
                path: Some("org/project".to_string()),
                username: None,
            }
        );

        assert_eq!(parse_git_url("git@github.com:chenarmy/GITBX.git"), None);
        assert_eq!(parse_git_url("ssh://git@github.com/chenarmy/GITBX.git"), None);
    }
}
