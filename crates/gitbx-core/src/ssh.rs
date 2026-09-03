use crate::auth::KeyringManager;
use crate::error::{GitbxError, Result};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{OnceLock, RwLock};

pub const REPOSITORY_SSH_KEY_CONFIG: &str = "gitbx.sshKey";

fn global_key() -> &'static RwLock<Option<PathBuf>> {
    static GLOBAL_KEY: OnceLock<RwLock<Option<PathBuf>>> = OnceLock::new();
    GLOBAL_KEY.get_or_init(|| RwLock::new(None))
}

fn validate_key_path(value: &str) -> Result<PathBuf> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(GitbxError::General(
            "SSH private key path cannot be empty".into(),
        ));
    }
    let path = PathBuf::from(trimmed);
    if !path.is_file() {
        return Err(GitbxError::General(format!(
            "SSH private key does not exist: {}",
            path.display()
        )));
    }
    if path
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("pub"))
    {
        return Err(GitbxError::General(
            "Select the SSH private key, not its .pub file".into(),
        ));
    }
    std::fs::canonicalize(&path).map_err(Into::into)
}

pub fn set_global_ssh_key(value: Option<&str>) -> Result<()> {
    let key = value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(validate_key_path)
        .transpose()?;
    let mut current = global_key()
        .write()
        .map_err(|_| GitbxError::General("Global SSH configuration lock poisoned".into()))?;
    *current = key;
    Ok(())
}

fn credential_name(private_key: &Path) -> String {
    private_key.to_string_lossy().into_owned()
}

pub fn save_ssh_key_passphrase(key_path: &str, passphrase: &str) -> Result<String> {
    let private_key = validate_key_path(key_path)?;
    if passphrase.is_empty() {
        return Err(GitbxError::General(
            "SSH key passphrase cannot be empty".into(),
        ));
    }
    KeyringManager::save_token(
        "ssh-key-passphrase",
        &credential_name(&private_key),
        passphrase,
    )?;
    Ok(crate::path_for_display(&private_key))
}

pub fn configured_ssh_key(config: Option<&git2::Config>) -> Result<Option<PathBuf>> {
    if let Some(config) = config {
        if let Ok(local_config) = config.open_level(git2::ConfigLevel::Local) {
            if let Ok(value) = local_config.get_string(REPOSITORY_SSH_KEY_CONFIG) {
                return validate_key_path(&value).map(Some);
            }
        }
    }

    let key = global_key()
        .read()
        .map_err(|_| GitbxError::General("Global SSH configuration lock poisoned".into()))?
        .clone();
    match key {
        Some(path) if path.is_file() => Ok(Some(path)),
        Some(path) => Err(GitbxError::General(format!(
            "SSH private key does not exist: {}",
            path.display()
        ))),
        None => Ok(None),
    }
}

pub(crate) fn passphrase_for(private_key: &Path) -> Option<String> {
    KeyringManager::get_token("ssh-key-passphrase", &credential_name(private_key)).ok()
}

pub(crate) fn public_key_for(private_key: &Path) -> Option<PathBuf> {
    let public_key = PathBuf::from(format!("{}.pub", private_key.to_string_lossy()));
    public_key.is_file().then_some(public_key)
}

/// Make system Git honor the same SSH-key precedence as libgit2.
pub(crate) fn configure_git_ssh(
    command: &mut Command,
    config: Option<&git2::Config>,
) -> Result<()> {
    let Some(private_key) = configured_ssh_key(config)? else {
        return Ok(());
    };
    let escaped = private_key.to_string_lossy().replace('"', "\\\"");
    command.env(
        "GIT_SSH_COMMAND",
        format!("ssh -i \"{escaped}\" -o IdentitiesOnly=yes -o BatchMode=yes"),
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{configured_ssh_key, set_global_ssh_key, REPOSITORY_SSH_KEY_CONFIG};
    use tempfile::tempdir;

    #[test]
    fn repository_key_takes_priority_over_global_key() {
        let directory = tempdir().expect("tempdir");
        let global = directory.path().join("global-key");
        let repository = directory.path().join("repo-key");
        std::fs::write(&global, "global").expect("global key");
        std::fs::write(&repository, "repo").expect("repository key");
        set_global_ssh_key(Some(global.to_str().expect("global path"))).expect("set global");

        let repo = git2::Repository::init(directory.path().join("repository")).expect("repo");
        let config = repo.config().expect("config");
        config
            .open_level(git2::ConfigLevel::Local)
            .expect("local config")
            .set_str(
                REPOSITORY_SSH_KEY_CONFIG,
                &repository.to_string_lossy().replace('\\', "/"),
            )
            .expect("write config");
        let config = repo.config().expect("config");
        assert_eq!(
            configured_ssh_key(Some(&config)).expect("configured key"),
            Some(repository)
        );
        set_global_ssh_key(None).expect("clear global");
    }

    #[test]
    fn invalid_repository_key_does_not_fall_back_to_global_key() {
        let directory = tempdir().expect("tempdir");
        let global = directory.path().join("global-key");
        std::fs::write(&global, "global").expect("global key");
        set_global_ssh_key(Some(global.to_str().expect("global path"))).expect("set global");

        let repo = git2::Repository::init(directory.path().join("repository")).expect("repo");
        let config = repo.config().expect("config");
        config
            .open_level(git2::ConfigLevel::Local)
            .expect("local config")
            .set_str(REPOSITORY_SSH_KEY_CONFIG, "missing-key")
            .expect("write config");
        let config = repo.config().expect("config");
        assert!(configured_ssh_key(Some(&config)).is_err());
        set_global_ssh_key(None).expect("clear global");
    }
}
