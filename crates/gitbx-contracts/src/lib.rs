use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GitErrorResponse {
    pub code: String,
    pub message: String,
    pub detail: Option<String>,
    pub conflict: bool,
    pub requires_confirmation: bool,
}

impl GitErrorResponse {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            detail: None,
            conflict: false,
            requires_confirmation: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OperationResult<T> {
    pub success: bool,
    pub value: Option<T>,
    pub output: Option<String>,
    pub error: Option<GitErrorResponse>,
}

impl<T> OperationResult<T> {
    pub fn success(value: T) -> Self {
        Self {
            success: true,
            value: Some(value),
            output: None,
            error: None,
        }
    }
}

impl OperationResult<()> {
    pub fn empty() -> Self {
        Self::success(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RepoPathRequest {
    pub repo_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FileRequest {
    pub repo_path: String,
    pub file_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CommitRequest {
    pub repo_path: String,
    pub message: String,
    pub author: String,
    pub email: String,
}
