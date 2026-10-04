use gitbx_contracts::{McpPermissionLevel, McpPolicyConfig, McpRepoRule};
use gitbx_core::GitService;
use regex::Regex;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

const CONFIG_DIR_NAME: &str = ".gitbx";
const POLICY_FILE_NAME: &str = "mcp-policy.json";

pub fn policy_file_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(CONFIG_DIR_NAME).join(POLICY_FILE_NAME))
}

pub struct PolicyEngine {
    policy_path: Option<PathBuf>,
    last_modified: Option<SystemTime>,
    cached_policy: McpPolicyConfig,
}

impl PolicyEngine {
    pub fn new() -> Self {
        let policy_path = policy_file_path();
        let (cached_policy, last_modified) = Self::load_from_path(policy_path.as_deref());
        Self {
            policy_path,
            last_modified,
            cached_policy,
        }
    }

    pub fn with_custom_path(path: PathBuf) -> Self {
        let (cached_policy, last_modified) = Self::load_from_path(Some(&path));
        Self {
            policy_path: Some(path),
            last_modified,
            cached_policy,
        }
    }

    fn load_from_path(path_opt: Option<&Path>) -> (McpPolicyConfig, Option<SystemTime>) {
        if let Some(path) = path_opt {
            if path.exists() {
                if let Ok(metadata) = fs::metadata(path) {
                    let mtime = metadata.modified().ok();
                    if let Ok(content) = fs::read_to_string(path) {
                        if let Ok(policy) = serde_json::from_str::<McpPolicyConfig>(&content) {
                            return (policy, mtime);
                        }
                    }
                }
            }
        }
        (McpPolicyConfig::default(), None)
    }

    pub fn reload_if_needed(&mut self) {
        if let Some(ref path) = self.policy_path {
            if path.exists() {
                if let Ok(metadata) = fs::metadata(path) {
                    let current_mtime = metadata.modified().ok();
                    if current_mtime != self.last_modified {
                        let (new_policy, mtime) = Self::load_from_path(Some(path));
                        self.cached_policy = new_policy;
                        self.last_modified = mtime;
                    }
                }
            }
        }
    }

    pub fn get_policy(&mut self) -> &McpPolicyConfig {
        self.reload_if_needed();
        &self.cached_policy
    }

    pub fn is_tool_enabled(&mut self, tool: &str) -> bool {
        self.reload_if_needed();
        self.cached_policy.enabled_tools.iter().any(|t| t == tool)
    }

    pub fn get_effective_rule(&mut self, repo_path: &str) -> Option<McpRepoRule> {
        self.reload_if_needed();
        let normalized = normalize_path(repo_path);
        
        self.cached_policy
            .allowed_repos
            .iter()
            .find(|r| normalize_path(&r.repo_path) == normalized)
            .cloned()
    }

    pub fn is_repo_allowed(&mut self, repo_path: &str) -> bool {
        self.reload_if_needed();
        if self.cached_policy.allow_all_repos {
            return true;
        }
        self.get_effective_rule(repo_path).is_some()
    }

    pub fn get_allowed_repo_paths(&mut self) -> Vec<String> {
        self.reload_if_needed();
        if self.cached_policy.allow_all_repos && self.cached_policy.allowed_repos.is_empty() {
            return Vec::new();
        }
        self.cached_policy
            .allowed_repos
            .iter()
            .map(|r| r.repo_path.clone())
            .collect()
    }

    pub fn get_effective_level(&mut self, repo_path: &str) -> McpPermissionLevel {
        self.reload_if_needed();
        if let Some(rule) = self.get_effective_rule(repo_path) {
            if let Some(level) = rule.override_level {
                return level;
            }
        }
        self.cached_policy.global_level
    }

    pub fn is_branch_protected(branch_name: &str, patterns: &[String]) -> bool {
        for pattern in patterns {
            if pattern == branch_name {
                return true;
            }
            if pattern.ends_with('*') {
                let prefix = &pattern[..pattern.len() - 1];
                if branch_name.starts_with(prefix) {
                    return true;
                }
            }
            // Support glob wildcard via regex conversion
            let regex_str = format!("^{}$", regex::escape(pattern).replace("\\*", ".*"));
            if let Ok(re) = Regex::new(&regex_str) {
                if re.is_match(branch_name) {
                    return true;
                }
            }
        }
        false
    }

    pub fn authorize_tool_call(
        &mut self,
        tool: &str,
        repo_path_opt: Option<&str>,
    ) -> Result<(), String> {
        self.reload_if_needed();

        // 1. Tool whitelist check
        if !self.is_tool_enabled(tool) {
            return Err(format!(
                "Tool '{}' is disabled in GITBX MCP policy settings.",
                tool
            ));
        }

        // Tools that don't need a repository path
        if tool == "gitbx_list_repos" {
            return Ok(());
        }

        // 2. Repository check
        let repo_path = match repo_path_opt {
            Some(p) if !p.trim().is_empty() => p,
            _ => return Err("Missing required argument 'repo_path'".to_string()),
        };

        if !self.is_repo_allowed(repo_path) {
            return Err(format!(
                "Repository '{}' is not authorized in GITBX MCP policy.",
                repo_path
            ));
        }

        // 3. Permission level check
        let level = self.get_effective_level(repo_path);
        if !level.allows_tool(tool) {
            return Err(format!(
                "Permission Denied: Tool '{}' requires a higher permission level than current effective level ({:?}).",
                tool, level
            ));
        }

        // 4. Remote push check
        if tool == "gitbx_push" {
            if let Some(rule) = self.get_effective_rule(repo_path) {
                if !rule.allow_remote_push {
                    return Err(
                        "Permission Denied: Remote push is disabled for this repository in GITBX MCP policy."
                            .to_string(),
                    );
                }
            }
        }

        // 5. Branch protection check for mutating actions
        if McpPermissionLevel::is_mutating_tool(tool) {
            let rule = self.get_effective_rule(repo_path);
            let protected_patterns = rule
                .as_ref()
                .map(|r| r.protected_branches.clone())
                .unwrap_or_else(|| {
                    vec![
                        "main".to_string(),
                        "master".to_string(),
                        "release/*".to_string(),
                        "prod/*".to_string(),
                    ]
                });

            // Inspect current branch
            if let Ok(repo) = GitService::open(repo_path) {
                if let Ok(branches) = repo.list_branches(None) {
                    if let Some(current) = branches.iter().find(|b| b.is_head) {
                        if Self::is_branch_protected(&current.name, &protected_patterns) {
                            return Err(format!(
                                "Permission Denied: Current branch '{}' is protected in GITBX. Please create a feature branch first.",
                                current.name
                            ));
                        }
                    }
                }
            }
        }

        Ok(())
    }
}

fn normalize_path(path_str: &str) -> String {
    let p = Path::new(path_str);
    let s = p.to_string_lossy().replace('\\', "/").to_lowercase();
    s.trim_end_matches('/').to_string()
}

static GLOBAL_POLICY: std::sync::OnceLock<Mutex<PolicyEngine>> = std::sync::OnceLock::new();

pub fn global_policy() -> &'static Mutex<PolicyEngine> {
    GLOBAL_POLICY.get_or_init(|| Mutex::new(PolicyEngine::new()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use gitbx_contracts::{McpPermissionLevel, McpPolicyConfig, McpRepoRule};

    #[test]
    fn test_branch_protection_wildcards() {
        let patterns = vec![
            "main".to_string(),
            "master".to_string(),
            "release/*".to_string(),
            "prod/*".to_string(),
        ];

        assert!(PolicyEngine::is_branch_protected("main", &patterns));
        assert!(PolicyEngine::is_branch_protected("master", &patterns));
        assert!(PolicyEngine::is_branch_protected("release/v1.0", &patterns));
        assert!(PolicyEngine::is_branch_protected("prod/hotfix", &patterns));
        assert!(!PolicyEngine::is_branch_protected("feature/test", &patterns));
        assert!(!PolicyEngine::is_branch_protected("fix/bug-1", &patterns));
    }

    #[test]
    fn test_path_normalization() {
        assert_eq!(
            normalize_path("C:\\Users\\Admin\\repo\\"),
            normalize_path("c:/users/admin/repo")
        );
    }

    #[test]
    fn test_permission_levels() {
        assert!(McpPermissionLevel::ReadOnly.allows_tool("gitbx_status"));
        assert!(McpPermissionLevel::ReadOnly.allows_tool("gitbx_diff"));
        assert!(!McpPermissionLevel::ReadOnly.allows_tool("gitbx_commit"));
        assert!(!McpPermissionLevel::ReadOnly.allows_tool("gitbx_push"));

        assert!(McpPermissionLevel::SafeWrite.allows_tool("gitbx_status"));
        assert!(McpPermissionLevel::SafeWrite.allows_tool("gitbx_stage_file"));
        assert!(McpPermissionLevel::SafeWrite.allows_tool("gitbx_commit"));
        assert!(!McpPermissionLevel::SafeWrite.allows_tool("gitbx_reset"));
        assert!(!McpPermissionLevel::SafeWrite.allows_tool("gitbx_push"));

        assert!(McpPermissionLevel::FullAccess.allows_tool("gitbx_reset"));
        assert!(McpPermissionLevel::FullAccess.allows_tool("gitbx_push"));
        assert!(McpPermissionLevel::FullAccess.allows_tool("gitbx_merge"));
    }

    #[test]
    fn test_repo_whitelist_and_override() {
        let mut policy = McpPolicyConfig::default();
        policy.allow_all_repos = false;
        policy.global_level = McpPermissionLevel::ReadOnly;

        let mut rule = McpRepoRule::new("C:/test/repo");
        rule.override_level = Some(McpPermissionLevel::SafeWrite);
        policy.allowed_repos.push(rule);

        let mut engine = PolicyEngine {
            policy_path: None,
            last_modified: None,
            cached_policy: policy,
        };

        // Allowed repo should have SafeWrite
        assert!(engine.is_repo_allowed("C:\\test\\repo"));
        assert_eq!(
            engine.get_effective_level("C:\\test\\repo"),
            McpPermissionLevel::SafeWrite
        );

        // Disallowed repo should be rejected
        assert!(!engine.is_repo_allowed("C:\\other\\repo"));

        // Tool authorize tests
        assert!(engine
            .authorize_tool_call("gitbx_stage_file", Some("C:\\test\\repo"))
            .is_ok());
        assert!(engine
            .authorize_tool_call("gitbx_stage_file", Some("C:\\other\\repo"))
            .is_err());
        assert!(engine
            .authorize_tool_call("gitbx_reset", Some("C:\\test\\repo"))
            .is_err());
    }
}
