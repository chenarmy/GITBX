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

impl From<GitbxError> for gitbx_contracts::GitErrorResponse {
    fn from(error: GitbxError) -> Self {
        let conflict = matches!(&error, GitbxError::MergeConflict(_));
        let code = match &error {
            GitbxError::MergeConflict(_) => "CONFLICT",
            GitbxError::AuthFailed(_) => "AUTH_FAILED",
            GitbxError::RepoNotFound(_) => "REPO_NOT_FOUND",
            GitbxError::BranchAlreadyExists(_) => "BRANCH_ALREADY_EXISTS",
            _ => "GIT_ERROR",
        };
        let mut res = gitbx_contracts::GitErrorResponse::new(code, error.to_string());
        res.conflict = conflict;
        res.detail = Some(error.to_string());
        res
    }
}

impl From<&GitbxError> for gitbx_contracts::GitErrorResponse {
    fn from(error: &GitbxError) -> Self {
        let conflict = matches!(error, GitbxError::MergeConflict(_));
        let code = match error {
            GitbxError::MergeConflict(_) => "CONFLICT",
            GitbxError::AuthFailed(_) => "AUTH_FAILED",
            GitbxError::RepoNotFound(_) => "REPO_NOT_FOUND",
            GitbxError::BranchAlreadyExists(_) => "BRANCH_ALREADY_EXISTS",
            _ => "GIT_ERROR",
        };
        let mut res = gitbx_contracts::GitErrorResponse::new(code, error.to_string());
        res.conflict = conflict;
        res.detail = Some(error.to_string());
        res
    }
}
