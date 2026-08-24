use crate::error::Result;
use crate::proxy_options;
use crate::repository::Repository;
use git2::{Cred, CredentialType, Error, FetchOptions, PushOptions, RemoteCallbacks};
use serde::{Deserialize, Serialize};

fn percent_decode(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len() {
                return None;
            }
            let high = (bytes[index + 1] as char).to_digit(16)?;
            let low = (bytes[index + 2] as char).to_digit(16)?;
            decoded.push((high * 16 + low) as u8);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded).ok()
}

fn embedded_http_credentials(url: &str) -> Option<(String, String)> {
    let authority = url
        .split_once("://")
        .map(|(_, rest)| rest.split(['/', '?', '#']).next().unwrap_or(rest))?;
    let (userinfo, _) = authority.rsplit_once('@')?;
    let (username, password) = userinfo.split_once(':')?;
    Some((percent_decode(username)?, percent_decode(password)?))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteItem {
    pub name: String,
    pub url: Option<String>,
    pub push_url: Option<String>,
}

pub fn authenticated_remote_callbacks(config: Option<git2::Config>) -> RemoteCallbacks<'static> {
    let mut callbacks = RemoteCallbacks::new();
    callbacks.credentials(
        move |url: &str, username_from_url: Option<&str>, allowed: CredentialType| {
            if allowed.is_user_pass_plaintext() {
                // Keep credentials supplied in a clone URL usable for later fetch/push
                // operations. Git may pass the remote URL back to this callback without
                // invoking the credential helper again.
                if let Some((username, password)) = embedded_http_credentials(url) {
                    return Cred::userpass_plaintext(&username, &password);
                }
                if let Some(ref cfg) = config {
                    if let Ok(credential) = Cred::credential_helper(cfg, url, username_from_url) {
                        return Ok(credential);
                    }
                } else if let Ok(default_cfg) = git2::Config::open_default() {
                    if let Ok(credential) =
                        Cred::credential_helper(&default_cfg, url, username_from_url)
                    {
                        return Ok(credential);
                    }
                }
            }

            if allowed.is_ssh_key() {
                return Cred::ssh_key_from_agent(username_from_url.unwrap_or("git"));
            }

            if allowed.is_username() {
                return Cred::username(username_from_url.unwrap_or("git"));
            }

            if allowed.is_default() {
                return Cred::default();
            }

            Err(Error::from_str(
                "no supported credentials were found in Git Credential Manager or SSH agent",
            ))
        },
    );
    callbacks
}

impl Repository {
    fn authenticated_callbacks(&self) -> Result<RemoteCallbacks<'static>> {
        Ok(authenticated_remote_callbacks(self.inner().config().ok()))
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

        remote.fetch(&[] as &[&str], Some(&mut fetch_opts), None)?;
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
        let mut local_branch = self.inner().find_branch(&branch, git2::BranchType::Local)?;
        let has_upstream = local_branch.upstream().is_ok();
        let mut remote = self.inner().find_remote(remote_name)?;
        let mut options = PushOptions::new();
        options.remote_callbacks(self.authenticated_callbacks()?);
        options.proxy_options(proxy_options());
        let refspec = format!("refs/heads/{branch}:refs/heads/{branch}");
        if let Err(error) = remote.push(&[refspec.as_str()], Some(&mut options)) {
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
        if !has_upstream {
            let tracking_branch = format!("{remote_name}/{branch}");
            local_branch.set_upstream(Some(&tracking_branch))?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::embedded_http_credentials;
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
    fn extracts_encoded_credentials_from_remote_url() {
        assert_eq!(
            embedded_http_credentials("https://alice:p%40ss%3Aword@example.com/repo.git"),
            Some(("alice".into(), "p@ss:word".into()))
        );
    }

    #[test]
    fn push_sets_tracking_branch_for_new_local_branch() {
        let remote_dir = tempdir().expect("remote tempdir");
        let local_dir = tempdir().expect("local tempdir");
        Repository::init(remote_dir.path(), true).expect("bare remote");
        let local = Repository::init(local_dir.path(), false).expect("local repository");
        fs::write(local_dir.path().join("README.md"), "initial\n").expect("write file");
        local.stage_all().expect("stage file");
        local
            .create_commit("initial", "Test", "test@example.com")
            .expect("initial commit");
        local
            .inner()
            .remote("origin", remote_dir.path().to_str().expect("remote path"))
            .expect("remote");

        local.push_current("origin").expect("push");
        let branch = local
            .inner()
            .head()
            .expect("head")
            .shorthand()
            .expect("branch")
            .to_string();
        let branch = local
            .inner()
            .find_branch(&branch, git2::BranchType::Local)
            .expect("local branch");
        assert_eq!(
            branch
                .upstream()
                .expect("upstream")
                .name()
                .expect("upstream name"),
            Some(format!("origin/{}", branch.name().unwrap().unwrap()).as_str())
        );
    }
}
