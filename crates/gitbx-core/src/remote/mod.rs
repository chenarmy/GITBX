use crate::error::{GitbxError, Result};
use crate::repository::Repository;
use git2::{Direction, FetchOptions, PushOptions, RemoteCallbacks};
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

        for name_opt in remotes.iter() {
            if let Some(name) = name_opt {
                if let Ok(remote) = self.inner().find_remote(name) {
                    list.push(RemoteItem {
                        name: name.to_string(),
                        url: remote.url().map(|s| s.to_string()),
                        push_url: remote.pushurl().map(|s| s.to_string()),
                    });
                }
            }
        }

        Ok(list)
    }

    pub fn fetch_remote(&self, remote_name: &str) -> Result<()> {
        let mut remote = self.inner().find_remote(remote_name)?;
        let mut callbacks = RemoteCallbacks::new();
        callbacks.credentials(|_url, username_from_url, _allowed_types| {
            git2::Cred::default()
        });

        let mut fetch_opts = FetchOptions::new();
        fetch_opts.remote_callbacks(callbacks);

        remote.fetch(&[] as &[&str], Some(&mut fetch_opts), None)?;
        Ok(())
    }
}
