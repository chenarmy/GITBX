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

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum McpPermissionLevel {
    ReadOnly,
    SafeWrite,
    FullAccess,
}

impl Default for McpPermissionLevel {
    fn default() -> Self {
        Self::SafeWrite
    }
}

impl McpPermissionLevel {
    pub fn allows_tool(&self, tool: &str) -> bool {
        match tool {
            "gitbx_list_repos" | "gitbx_status" | "gitbx_branches" | "gitbx_log"
            | "gitbx_tags" | "gitbx_diff" => true,
            "gitbx_stage_file" | "gitbx_stage_all" | "gitbx_commit" | "gitbx_create_branch"
            | "gitbx_fetch" => matches!(self, Self::SafeWrite | Self::FullAccess),
            "gitbx_merge" | "gitbx_rebase" | "gitbx_cherry_pick" | "gitbx_reset"
            | "gitbx_pull" | "gitbx_push" => *self == Self::FullAccess,
            _ => false,
        }
    }

    pub fn is_mutating_tool(tool: &str) -> bool {
        matches!(
            tool,
            "gitbx_stage_file"
                | "gitbx_stage_all"
                | "gitbx_commit"
                | "gitbx_create_branch"
                | "gitbx_merge"
                | "gitbx_rebase"
                | "gitbx_cherry_pick"
                | "gitbx_reset"
                | "gitbx_pull"
                | "gitbx_push"
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct McpRepoRule {
    pub repo_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub override_level: Option<McpPermissionLevel>,
    #[serde(default = "default_protected_branches")]
    pub protected_branches: Vec<String>,
    #[serde(default = "default_true")]
    pub allow_remote_fetch: bool,
    #[serde(default)]
    pub allow_remote_push: bool,
    #[serde(default)]
    pub allow_force_push: bool,
}

fn default_true() -> bool {
    true
}

fn default_protected_branches() -> Vec<String> {
    vec![
        "main".to_string(),
        "master".to_string(),
        "release/*".to_string(),
        "prod/*".to_string(),
    ]
}

impl McpRepoRule {
    pub fn new(repo_path: impl Into<String>) -> Self {
        Self {
            repo_path: repo_path.into(),
            group_name: None,
            override_level: None,
            protected_branches: default_protected_branches(),
            allow_remote_fetch: true,
            allow_remote_push: false,
            allow_force_push: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct McpPolicyConfig {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default)]
    pub global_level: McpPermissionLevel,
    #[serde(default = "default_true")]
    pub allow_all_repos: bool,
    #[serde(default)]
    pub allowed_repos: Vec<McpRepoRule>,
    #[serde(default = "default_enabled_tools")]
    pub enabled_tools: Vec<String>,
    #[serde(default = "default_true")]
    pub allow_active_repo_fallback: bool,
}

fn default_version() -> u32 {
    1
}

pub fn default_enabled_tools() -> Vec<String> {
    vec![
        "gitbx_list_repos".to_string(),
        "gitbx_status".to_string(),
        "gitbx_branches".to_string(),
        "gitbx_log".to_string(),
        "gitbx_tags".to_string(),
        "gitbx_diff".to_string(),
        "gitbx_stage_file".to_string(),
        "gitbx_stage_all".to_string(),
        "gitbx_commit".to_string(),
        "gitbx_create_branch".to_string(),
        "gitbx_fetch".to_string(),
    ]
}

impl Default for McpPolicyConfig {
    fn default() -> Self {
        Self {
            version: 1,
            global_level: McpPermissionLevel::SafeWrite,
            allow_all_repos: true,
            allowed_repos: Vec::new(),
            enabled_tools: default_enabled_tools(),
            allow_active_repo_fallback: true,
        }
    }
}

