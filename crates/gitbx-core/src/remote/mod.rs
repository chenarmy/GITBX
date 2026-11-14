use crate::error::{GitbxError, Result};
use crate::process::create_git_command;
use crate::proxy_options;
use crate::repository::Repository;
use crate::ssh::{
    configure_git_ssh, configured_ssh_key, passphrase_for, public_key_for,
    REPOSITORY_SSH_KEY_CONFIG,
};
use git2::{
    AutotagOption, ConfigLevel, Cred, CredentialType, Error, FetchOptions, PushOptions,
    RemoteCallbacks,
};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};

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
    } else {
        let stripped = raw.strip_prefix("http://")?;
        ("http", stripped)
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

pub fn classify_remote_auth_error(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    [
        "401",
        "403",
        "authentication",
        "credentials",
        "could not read username",
        "could not read password",
        "access denied",
        "unauthorized",
        "not authorized",
        "permission denied",
        "no supported credentials",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
}

pub fn save_credentials_with_helper(
    repo_path: Option<&std::path::Path>,
    url: &str,
    username: &str,
    password: &str,
) {
    let Some(parsed) = parse_git_url(url) else {
        return;
    };
    if username.is_empty() || password.is_empty() {
        return;
    }
    let mut command = create_git_command();
    if let Some(path) = repo_path {
        command.current_dir(path);
    }
    command.args(["credential", "approve"]);
    command.stdin(std::process::Stdio::piped());
    command.stdout(std::process::Stdio::null());
    command.stderr(std::process::Stdio::null());

    if let Ok(mut child) = command.spawn() {
        if let Some(mut stdin) = child.stdin.take() {
            use std::io::Write;
            let _ = writeln!(stdin, "protocol={}", parsed.protocol);
            let _ = writeln!(stdin, "host={}", parsed.host);
            if let Some(ref path) = parsed.path {
                let _ = writeln!(stdin, "path={}", path);
            }
            let _ = writeln!(stdin, "username={}", username);
            let _ = writeln!(stdin, "password={}", password);
            let _ = writeln!(stdin);
        }
        let _ = child.wait();
    }
}

pub fn authenticated_remote_callbacks(
    config: Option<git2::Config>,
    repo_path: Option<std::path::PathBuf>,
) -> Result<RemoteCallbacks<'static>> {
    authenticated_remote_callbacks_with_credentials(config, repo_path, None, None)
}

pub fn authenticated_remote_callbacks_with_credentials(
    config: Option<git2::Config>,
    repo_path: Option<std::path::PathBuf>,
    explicit_username: Option<String>,
    explicit_password: Option<String>,
) -> Result<RemoteCallbacks<'static>> {
    let configured_key = configured_ssh_key(config.as_ref())?;
    let configured_passphrase = configured_key.as_deref().and_then(passphrase_for);
    let explicit_user = explicit_username
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let explicit_pass = explicit_password.filter(|value| !value.is_empty());
    let tried_explicit = AtomicBool::new(false);
    let mut callbacks = RemoteCallbacks::new();
    callbacks.credentials(
        move |url: &str, username_from_url: Option<&str>, allowed: CredentialType| {
            if allowed.is_user_pass_plaintext() {
                if let Some(ref pass) = explicit_pass {
                    if !tried_explicit.swap(true, Ordering::SeqCst) {
                        let user = explicit_user
                            .as_deref()
                            .or(username_from_url)
                            .unwrap_or("git");
                        return Cred::userpass_plaintext(user, pass);
                    }
                    return Err(Error::from_str(
                        "Remote rejected the provided username or password/token (401)",
                    ));
                }
                if let Some(credential) =
                    find_credentials_with_helper(repo_path.as_deref(), url, username_from_url)
                {
                    return Ok(credential);
                }
            }

            if allowed.is_ssh_key() {
                let user = username_from_url
                    .or(explicit_user.as_deref())
                    .unwrap_or("git");
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
                return Cred::username(
                    username_from_url
                        .or(explicit_user.as_deref())
                        .unwrap_or("git"),
                );
            }

            Err(Error::from_str(
                "no supported credentials were found in Git Credential Manager or SSH agent",
            ))
        },
    );
    Ok(callbacks)
}

struct AskpassDirGuard(std::path::PathBuf);

impl Drop for AskpassDirGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

pub(crate) fn clone_with_git_cli(
    url: &str,
    destination: &std::path::Path,
    username: Option<&str>,
    password: Option<&str>,
) -> Result<()> {
    let mut command = create_git_command();
    let global_config = git2::Config::open_default().ok();
    configure_git_ssh(&mut command, global_config.as_ref())?;
    command.arg("clone").arg(url).arg(destination);
    command.env("GIT_TERMINAL_PROMPT", "0");
    command.env("GCM_INTERACTIVE", "never");

    let _askpass_dir = if let Some(pass) = password.filter(|value| !value.is_empty()) {
        static ASKPASS_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
        let seq = ASKPASS_SEQ.fetch_add(1, Ordering::Relaxed);
        let dir_path =
            std::env::temp_dir().join(format!("gitbx-askpass-{}-{}", std::process::id(), seq));
        std::fs::create_dir_all(&dir_path)?;
        let guard = AskpassDirGuard(dir_path.clone());
        let script_path = dir_path.join("askpass.sh");
        let script_body = concat!(
            "#!/bin/sh\n",
            "case \"$1\" in\n",
            "  *Username*|*username*) printf '%s\\n' \"$GITBX_GIT_USERNAME\" ;;\n",
            "  *) printf '%s\\n' \"$GITBX_GIT_PASSWORD\" ;;\n",
            "esac\n"
        );
        std::fs::write(&script_path, script_body)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&script_path)?.permissions();
            perms.set_mode(0o700);
            std::fs::set_permissions(&script_path, perms)?;
        }
        let user = username
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("git");
        command.env("GIT_ASKPASS", &script_path);
        command.env("SSH_ASKPASS_REQUIRE", "never");
        command.env("GITBX_GIT_USERNAME", user);
        command.env("GITBX_GIT_PASSWORD", pass);
        Some(guard)
    } else {
        None
    };

    let output = command
        .output()
        .map_err(|error| GitbxError::General(format!("Failed to start Git: {error}")))?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if stderr.is_empty() { stdout } else { stderr };
    if classify_remote_auth_error(&detail) {
        return Err(GitbxError::AuthFailed(if detail.is_empty() {
            "Authentication required to clone this repository. Please enter your username and password or access token.".into()
        } else {
            detail
        }));
    }
    Err(GitbxError::General(if detail.is_empty() {
        "Git clone failed".into()
    } else {
        detail
    }))
}

impl Repository {
    fn authenticated_callbacks(&self) -> Result<RemoteCallbacks<'static>> {
        authenticated_remote_callbacks(self.inner().config().ok(), Some(self.path().to_path_buf()))
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

    fn fetch_options(&self) -> Result<FetchOptions<'static>> {
        let mut fetch_opts = FetchOptions::new();
        fetch_opts.remote_callbacks(self.authenticated_callbacks()?);
        fetch_opts.proxy_options(proxy_options());
        fetch_opts.download_tags(AutotagOption::All);
        Ok(fetch_opts)
    }

    fn run_git_fetch_cli(
        &self,
        args: &[&str],
    ) -> std::result::Result<(), crate::error::GitbxError> {
        let mut command = create_git_command();
        let config = self.inner().config().ok();
        configure_git_ssh(&mut command, config.as_ref())?;
        let output = command
            .current_dir(self.path())
            .args(args)
            .output()
            .map_err(|error| GitbxError::General(format!("Failed to start Git fetch: {error}")))?;
        if output.status.success() {
            return Ok(());
        }
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if !stderr.is_empty() { stderr } else { stdout };
        if classify_remote_auth_error(&detail) {
            return Err(GitbxError::AuthFailed(detail));
        }
        Err(GitbxError::General(if detail.is_empty() {
            "Git fetch failed".into()
        } else {
            detail
        }))
    }

    pub fn fetch_remote(&self, remote_name: &str) -> Result<()> {
        let mut remote = self.inner().find_remote(remote_name)?;
        let mut fetch_opts = self.fetch_options()?;

        if let Err(err) = remote.fetch(&[] as &[&str], Some(&mut fetch_opts), None) {
            if self
                .run_git_fetch_cli(&["fetch", remote_name, "--tags"])
                .is_ok()
            {
                return Ok(());
            }
            if classify_remote_auth_error(err.message()) {
                return Err(GitbxError::AuthFailed(err.message().to_string()));
            }
            return Err(err.into());
        }

        // Also pull unreferenced or lightweight remote tags without overwriting
        // divergent local unpushed tags.
        let mut tag_fetch_opts = self.fetch_options()?;
        if let Err(err) = remote.fetch(
            &["refs/tags/*:refs/tags/*"],
            Some(&mut tag_fetch_opts),
            None,
        ) {
            let lower = err.message().to_ascii_lowercase();
            if !lower.contains("would clobber") && !lower.contains("non-fast-forward") {
                let _ = self.run_git_fetch_cli(&["fetch", remote_name, "--tags"]);
            }
        }
        Ok(())
    }

    pub fn sync_tags(&self, remote_name: &str) -> Result<()> {
        let remotes = self.inner().remotes()?;
        let target_remote = if remote_name.trim().is_empty() {
            remotes
                .get(0)
                .ok_or_else(|| GitbxError::General("No Git remote is configured".into()))?
                .to_string()
        } else {
            remote_name.trim().to_string()
        };

        // `git fetch <remote> --prune --tags --prune-tags --force` aligns local tag refs
        // with the remote repository cleanly (pulling moved tags & pruning deleted ones).
        if self
            .run_git_fetch_cli(&[
                "fetch",
                &target_remote,
                "--prune",
                "--tags",
                "--prune-tags",
                "--force",
            ])
            .is_ok()
        {
            return Ok(());
        }

        let mut remote = self.inner().find_remote(&target_remote)?;
        let mut fetch_opts = self.fetch_options()?;
        remote
            .fetch(&["+refs/tags/*:refs/tags/*"], Some(&mut fetch_opts), None)
            .map_err(|err| {
                if classify_remote_auth_error(err.message()) {
                    GitbxError::AuthFailed(err.message().to_string())
                } else {
                    err.into()
                }
            })
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
        self.push_branch(remote_name, &branch)
    }

    fn push_refspecs_with_fallback(
        &self,
        remote_name: &str,
        refspecs: &[&str],
        cli_args: &[&str],
    ) -> Result<()> {
        let mut remote = self.inner().find_remote(remote_name)?;
        let mut options = PushOptions::new();
        options.remote_callbacks(self.authenticated_callbacks()?);
        options.proxy_options(proxy_options());

        if let Err(error) = remote.push(refspecs, Some(&mut options)) {
            let mut command = create_git_command();
            let config = self.inner().config().ok();
            configure_git_ssh(&mut command, config.as_ref())?;
            if let Ok(output) = command.current_dir(self.path()).args(cli_args).output() {
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
                            || classify_remote_auth_error(&detail)
                        {
                            return Err(crate::error::GitbxError::AuthFailed(detail));
                        }
                        return Err(crate::error::GitbxError::General(detail));
                    }
                }
            }

            if classify_remote_auth_error(error.message()) {
                return Err(crate::error::GitbxError::AuthFailed(
                    "Remote rejected the Git credentials. Sign in with Git Credential Manager or configure an SSH key, then retry Push."
                        .into(),
                ));
            }
            return Err(error.into());
        }
        Ok(())
    }

    pub fn push_branch(&self, remote_name: &str, branch: &str) -> Result<()> {
        // Resolve the branch before building a refspec. Besides producing a
        // useful error, this prevents arbitrary refspecs from entering here.
        self.inner().find_branch(branch, git2::BranchType::Local)?;
        let refspec = format!("refs/heads/{branch}:refs/heads/{branch}");
        self.push_refspecs_with_fallback(
            remote_name,
            &[refspec.as_str()],
            &["push", remote_name, &refspec],
        )
    }

    pub fn push_tag(&self, remote_name: &str, tag_name: &str) -> Result<()> {
        let tag_name = tag_name.trim();
        let reference_name = format!("refs/tags/{tag_name}");
        self.inner().find_reference(&reference_name)?;
        let refspec = format!("{reference_name}:{reference_name}");
        self.push_refspecs_with_fallback(
            remote_name,
            &[refspec.as_str()],
            &["push", remote_name, &refspec],
        )
    }

    pub fn push_all_tags(&self, remote_name: &str) -> Result<()> {
        let tag_names = self.inner().tag_names(None)?;
        let refspecs: Vec<String> = tag_names
            .iter()
            .flatten()
            .map(|name| format!("refs/tags/{name}:refs/tags/{name}"))
            .collect();
        if refspecs.is_empty() {
            return Ok(());
        }
        let refspec_refs: Vec<&str> = refspecs.iter().map(String::as_str).collect();
        self.push_refspecs_with_fallback(
            remote_name,
            &refspec_refs,
            &["push", remote_name, "--tags"],
        )
    }

    pub fn delete_remote_tag(&self, remote_name: &str, tag_name: &str) -> Result<()> {
        let tag_name = tag_name.trim();
        let refspec = format!(":refs/tags/{tag_name}");
        self.push_refspecs_with_fallback(
            remote_name,
            &[refspec.as_str()],
            &["push", remote_name, "--delete", "tag", tag_name],
        )
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
        assert_eq!(
            parse_git_url("ssh://git@github.com/chenarmy/GITBX.git"),
            None
        );
    }

    #[test]
    fn classifies_remote_auth_errors() {
        use super::classify_remote_auth_error;
        assert!(classify_remote_auth_error(
            "remote: HTTP Basic: Access denied (403)"
        ));
        assert!(classify_remote_auth_error(
            "fatal: could not read Username for 'https://github.com': terminal prompts disabled"
        ));
        assert!(classify_remote_auth_error(
            "no supported credentials were found in Git Credential Manager or SSH agent"
        ));
        assert!(!classify_remote_auth_error("failed to resolve host"));
    }

    #[test]
    fn fetches_syncs_pushes_and_deletes_remote_tags() {
        let dir = tempdir().expect("tempdir");
        let origin_path = dir.path().join("origin.git");
        let seed_path = dir.path().join("seed");
        let local_path = dir.path().join("local");

        let origin = Repository::init(&origin_path, true).expect("init origin");
        origin
            .inner()
            .set_head("refs/heads/main")
            .expect("origin head main");
        drop(origin);

        let seed = Repository::init(&seed_path, false).expect("init seed");
        seed.inner().set_head("refs/heads/main").unwrap();
        seed.inner()
            .remote("origin", origin_path.to_str().unwrap())
            .expect("seed remote");
        std::fs::write(seed_path.join("a.txt"), "v1\n").expect("write a");
        let mut index = seed.inner().index().expect("index");
        index.add_path(std::path::Path::new("a.txt")).expect("add");
        index.write().expect("write index");
        let tree_id = index.write_tree().expect("write tree");
        let tree = seed.inner().find_tree(tree_id).expect("tree");
        let sig = git2::Signature::now("Test", "test@example.com").expect("sig");
        let c1 = seed
            .inner()
            .commit(Some("HEAD"), &sig, &sig, "init", &tree, &[])
            .expect("c1");
        let obj1 = seed.inner().find_object(c1, None).expect("obj1");
        drop(index);
        drop(tree);
        seed.push_branch("origin", "main").expect("push main");
        seed.inner()
            .tag("v1.0.0", &obj1, &sig, "release v1.0.0", false)
            .expect("tag v1");
        seed.push_tag("origin", "v1.0.0").expect("push tag v1");

        // Clone into local
        crate::GitService::clone_repo(origin_path.to_str().unwrap(), local_path.to_str().unwrap())
            .expect("clone local");

        // Push a second tag on another branch in seed (not on main tip!)
        seed.create_branch("side", None).unwrap();
        seed.checkout_branch("side").unwrap();
        std::fs::write(seed_path.join("side.txt"), "side\n").unwrap();
        let mut index = seed.inner().index().unwrap();
        index.add_path(std::path::Path::new("side.txt")).unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = seed.inner().find_tree(tree_id).unwrap();
        let c2 = seed
            .inner()
            .commit(
                Some("HEAD"),
                &sig,
                &sig,
                "side commit",
                &tree,
                &[&seed.inner().find_commit(c1).unwrap()],
            )
            .unwrap();
        let obj2 = seed.inner().find_object(c2, None).unwrap();
        seed.inner()
            .tag("v1.1.0-rc1", &obj2, &sig, "side tag", false)
            .unwrap();
        seed.push_tag("origin", "v1.1.0-rc1").unwrap();

        let local = Repository::open(&local_path).expect("open local");
        // Local shouldn't have v1.1.0-rc1 yet before fetch_remote
        assert!(!local
            .list_tags()
            .unwrap()
            .iter()
            .any(|t| t.name == "v1.1.0-rc1"));

        local
            .fetch_remote("origin")
            .expect("fetch remote pulls unmerged tags too");
        assert!(local
            .list_tags()
            .unwrap()
            .iter()
            .any(|t| t.name == "v1.1.0-rc1"));

        // Local creates and pushes v1.2.0
        local
            .inner()
            .tag_lightweight(
                "v1.2.0",
                &local
                    .inner()
                    .head()
                    .unwrap()
                    .peel(git2::ObjectType::Commit)
                    .unwrap(),
                false,
            )
            .unwrap();
        local.push_tag("origin", "v1.2.0").expect("push local tag");
        assert!(seed.list_tags().unwrap().iter().all(|t| t.name != "v1.2.0"));
        seed.sync_tags("origin").expect("sync tags pulls v1.2.0");
        assert!(seed.list_tags().unwrap().iter().any(|t| t.name == "v1.2.0"));

        // Delete remote tag via Service and confirm sync_tags prunes it
        crate::GitService::delete_tag(local_path.to_str().unwrap(), "v1.2.0", Some("origin"))
            .expect("delete local+remote tag");
        seed.sync_tags("origin").expect("sync prunes deleted tag");
        assert!(!seed.list_tags().unwrap().iter().any(|t| t.name == "v1.2.0"));
    }
}
