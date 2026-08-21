use crate::error::Result;
use crate::repository::Repository;
use git2::{Cred, CredentialType, Error, FetchOptions, PushOptions, RemoteCallbacks};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteItem {
    pub name: String,
    pub url: Option<String>,
    pub push_url: Option<String>,
}

impl Repository {
    fn authenticated_callbacks(&self) -> Result<RemoteCallbacks<'static>> {
        let config = self.inner().config()?;
        let mut callbacks = RemoteCallbacks::new();
        callbacks.credentials(
            move |url: &str, username_from_url: Option<&str>, allowed: CredentialType| {
                if allowed.is_user_pass_plaintext() {
                    if let Ok(credential) = Cred::credential_helper(&config, url, username_from_url)
                    {
                        return Ok(credential);
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
        Ok(callbacks)
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

    pub fn fetch_remote(&self, remote_name: &str) -> Result<()> {
        let mut remote = self.inner().find_remote(remote_name)?;
        let mut fetch_opts = FetchOptions::new();
        fetch_opts.remote_callbacks(self.authenticated_callbacks()?);

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
        let mut remote = self.inner().find_remote(remote_name)?;
        let mut options = PushOptions::new();
        options.remote_callbacks(self.authenticated_callbacks()?);
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
        Ok(())
    }
}
