use crate::error::Result;
use crate::repository::Repository;
use git2::{FetchOptions, PushOptions, RemoteCallbacks};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteItem {
    pub name: String,
    pub url: Option<String>,
    pub push_url: Option<String>,
}

impl Repository {
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
        let mut callbacks = RemoteCallbacks::new();
        callbacks.credentials(|_url, _username_from_url, _allowed_types| git2::Cred::default());

        let mut fetch_opts = FetchOptions::new();
        fetch_opts.remote_callbacks(callbacks);

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
        let mut callbacks = RemoteCallbacks::new();
        callbacks.credentials(|_url, _username, _allowed| git2::Cred::default());
        let mut options = PushOptions::new();
        options.remote_callbacks(callbacks);
        let refspec = format!("refs/heads/{branch}:refs/heads/{branch}");
        remote.push(&[refspec.as_str()], Some(&mut options))?;
        Ok(())
    }
}
