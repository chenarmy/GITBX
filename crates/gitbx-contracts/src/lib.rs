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

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum McpPermissionLevel {
    ReadOnly,
    #[default]
    SafeWrite,
    FullAccess,
}

impl McpPermissionLevel {
    pub fn allows_tool(&self, tool: &str) -> bool {
        match tool {
            "gitbx_list_repos" | "gitbx_status" | "gitbx_branches" | "gitbx_log" | "gitbx_tags"
            | "gitbx_diff" => true,
            "gitbx_stage_file"
            | "gitbx_stage_all"
            | "gitbx_commit"
            | "gitbx_create_branch"
            | "gitbx_fetch" => matches!(self, Self::SafeWrite | Self::FullAccess),
            "gitbx_merge" | "gitbx_rebase" | "gitbx_cherry_pick" | "gitbx_reset" | "gitbx_pull"
            | "gitbx_push" => *self == Self::FullAccess,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, Clone, Copy)]
    struct ToolPermissionCase {
        name: &'static str,
        read_only: bool,
        safe_write: bool,
        full_access: bool,
        mutating: bool,
    }

    const TOOL_PERMISSION_CASES: [ToolPermissionCase; 17] = [
        ToolPermissionCase {
            name: "gitbx_list_repos",
            read_only: true,
            safe_write: true,
            full_access: true,
            mutating: false,
        },
        ToolPermissionCase {
            name: "gitbx_status",
            read_only: true,
            safe_write: true,
            full_access: true,
            mutating: false,
        },
        ToolPermissionCase {
            name: "gitbx_branches",
            read_only: true,
            safe_write: true,
            full_access: true,
            mutating: false,
        },
        ToolPermissionCase {
            name: "gitbx_log",
            read_only: true,
            safe_write: true,
            full_access: true,
            mutating: false,
        },
        ToolPermissionCase {
            name: "gitbx_tags",
            read_only: true,
            safe_write: true,
            full_access: true,
            mutating: false,
        },
        ToolPermissionCase {
            name: "gitbx_diff",
            read_only: true,
            safe_write: true,
            full_access: true,
            mutating: false,
        },
        ToolPermissionCase {
            name: "gitbx_stage_file",
            read_only: false,
            safe_write: true,
            full_access: true,
            mutating: true,
        },
        ToolPermissionCase {
            name: "gitbx_stage_all",
            read_only: false,
            safe_write: true,
            full_access: true,
            mutating: true,
        },
        ToolPermissionCase {
            name: "gitbx_commit",
            read_only: false,
            safe_write: true,
            full_access: true,
            mutating: true,
        },
        ToolPermissionCase {
            name: "gitbx_create_branch",
            read_only: false,
            safe_write: true,
            full_access: true,
            mutating: true,
        },
        ToolPermissionCase {
            name: "gitbx_fetch",
            read_only: false,
            safe_write: true,
            full_access: true,
            mutating: false,
        },
        ToolPermissionCase {
            name: "gitbx_merge",
            read_only: false,
            safe_write: false,
            full_access: true,
            mutating: true,
        },
        ToolPermissionCase {
            name: "gitbx_rebase",
            read_only: false,
            safe_write: false,
            full_access: true,
            mutating: true,
        },
        ToolPermissionCase {
            name: "gitbx_cherry_pick",
            read_only: false,
            safe_write: false,
            full_access: true,
            mutating: true,
        },
        ToolPermissionCase {
            name: "gitbx_reset",
            read_only: false,
            safe_write: false,
            full_access: true,
            mutating: true,
        },
        ToolPermissionCase {
            name: "gitbx_pull",
            read_only: false,
            safe_write: false,
            full_access: true,
            mutating: true,
        },
        ToolPermissionCase {
            name: "gitbx_push",
            read_only: false,
            safe_write: false,
            full_access: true,
            mutating: true,
        },
    ];

    #[test]
    fn mcp_tool_permission_matrix_matches_contract() {
        for case in TOOL_PERMISSION_CASES {
            for (level, expected) in [
                (McpPermissionLevel::ReadOnly, case.read_only),
                (McpPermissionLevel::SafeWrite, case.safe_write),
                (McpPermissionLevel::FullAccess, case.full_access),
            ] {
                assert_eq!(
                    level.allows_tool(case.name),
                    expected,
                    "unexpected {level:?} permission for {}",
                    case.name
                );
            }
        }

        assert!(!McpPermissionLevel::FullAccess.allows_tool("gitbx_unknown"));
    }

    #[test]
    fn mcp_tool_mutation_classification_matches_contract() {
        for case in TOOL_PERMISSION_CASES {
            assert_eq!(
                McpPermissionLevel::is_mutating_tool(case.name),
                case.mutating,
                "unexpected mutation classification for {}",
                case.name
            );
        }

        assert!(!McpPermissionLevel::is_mutating_tool("gitbx_unknown"));
    }

    #[test]
    fn mcp_policy_config_json_round_trip_uses_snake_case() {
        let policy = McpPolicyConfig {
            version: 7,
            global_level: McpPermissionLevel::SafeWrite,
            allow_all_repos: false,
            allowed_repos: vec![
                McpRepoRule {
                    repo_path: "C:/work/read-only".to_string(),
                    group_name: Some("review".to_string()),
                    override_level: Some(McpPermissionLevel::ReadOnly),
                    protected_branches: vec!["main".to_string()],
                    allow_remote_fetch: true,
                    allow_remote_push: false,
                    allow_force_push: false,
                },
                McpRepoRule {
                    repo_path: "C:/work/full-access".to_string(),
                    group_name: None,
                    override_level: Some(McpPermissionLevel::FullAccess),
                    protected_branches: Vec::new(),
                    allow_remote_fetch: true,
                    allow_remote_push: true,
                    allow_force_push: true,
                },
            ],
            enabled_tools: TOOL_PERMISSION_CASES
                .iter()
                .map(|case| case.name.to_string())
                .collect(),
            allow_active_repo_fallback: false,
        };

        let json = serde_json::to_string(&policy).expect("serialize MCP policy as JSON");
        let json_value: serde_json::Value =
            serde_json::from_str(&json).expect("parse serialized MCP policy JSON");

        assert_eq!(json_value["global_level"], "safe_write");
        assert_eq!(
            json_value["allowed_repos"][0]["override_level"],
            "read_only"
        );
        assert_eq!(
            json_value["allowed_repos"][1]["override_level"],
            "full_access"
        );
        assert!(json_value["allowed_repos"][1].get("group_name").is_none());

        let round_tripped: McpPolicyConfig =
            serde_json::from_str(&json).expect("deserialize MCP policy JSON");
        assert_eq!(round_tripped, policy);
    }

    #[test]
    fn mcp_policy_config_missing_json_fields_use_defaults() {
        let all_missing: McpPolicyConfig =
            serde_json::from_str("{}").expect("deserialize empty MCP policy JSON");
        assert_eq!(all_missing, McpPolicyConfig::default());

        let partially_configured: McpPolicyConfig = serde_json::from_str(
            r#"{
                "version": 9,
                "global_level": "read_only",
                "allow_all_repos": false,
                "allowed_repos": [{ "repo_path": "C:/work/repo" }]
            }"#,
        )
        .expect("deserialize partial MCP policy JSON");

        assert_eq!(partially_configured.version, 9);
        assert_eq!(
            partially_configured.global_level,
            McpPermissionLevel::ReadOnly
        );
        assert!(!partially_configured.allow_all_repos);
        assert_eq!(partially_configured.enabled_tools, default_enabled_tools());
        assert!(partially_configured.allow_active_repo_fallback);

        assert_eq!(partially_configured.allowed_repos.len(), 1);
        let repo = &partially_configured.allowed_repos[0];
        assert_eq!(repo.repo_path, "C:/work/repo");
        assert_eq!(repo.group_name, None);
        assert_eq!(repo.override_level, None);
        assert_eq!(repo.protected_branches, default_protected_branches());
        assert!(repo.allow_remote_fetch);
        assert!(!repo.allow_remote_push);
        assert!(!repo.allow_force_push);
    }
}
