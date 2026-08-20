use crate::error::Result;
use keyring::Entry;
use serde::{Deserialize, Serialize};

pub const SERVICE_NAME: &str = "gitbx_auth";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredCredential {
    pub provider: String,
    pub username: String,
    pub token: String,
}

pub struct KeyringManager;

impl KeyringManager {
    pub fn save_token(provider: &str, username: &str, token: &str) -> Result<()> {
        let key = format!("{}:{}", provider, username);
        let entry = Entry::new(SERVICE_NAME, &key)?;
        entry.set_password(token)?;
        Ok(())
    }

    pub fn get_token(provider: &str, username: &str) -> Result<String> {
        let key = format!("{}:{}", provider, username);
        let entry = Entry::new(SERVICE_NAME, &key)?;
        let password = entry.get_password()?;
        Ok(password)
    }

    pub fn delete_token(provider: &str, username: &str) -> Result<()> {
        let key = format!("{}:{}", provider, username);
        let entry = Entry::new(SERVICE_NAME, &key)?;
        entry.delete_password()?;
        Ok(())
    }
}
