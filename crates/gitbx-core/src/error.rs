use thiserror::Error;

#[derive(Error, Debug)]
pub enum GitbxError {
    #[error("Repository not found at: {0}")]
    RepoNotFound(String),

    #[error("Git error: {0}")]
    Git(#[from] git2::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Keyring error: {0}")]
    Keyring(#[from] keyring::Error),

    #[error("Authentication failed: {0}")]
    AuthFailed(String),

    #[error("Branch '{0}' already exists")]
    BranchAlreadyExists(String),

    #[error("Merge conflict encountered: {0}")]
    MergeConflict(String),

    #[error("General error: {0}")]
    General(String),
}

pub type Result<T> = std::result::Result<T, GitbxError>;
