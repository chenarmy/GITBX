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
    last_file_size: Option<u64>,
    cached_policy: McpPolicyConfig,
}

impl Default for PolicyEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl PolicyEngine {
    pub fn new() -> Self {
        let policy_path = policy_file_path();
        let (cached_policy, last_modified, last_file_size) =
            Self::load_from_path(policy_path.as_deref());
        Self {
            policy_path,
            last_modified,
            last_file_size,
            cached_policy,
        }
    }

    pub fn with_custom_path(path: PathBuf) -> Self {
        let (cached_policy, last_modified, last_file_size) = Self::load_from_path(Some(&path));
        Self {
            policy_path: Some(path),
            last_modified,
            last_file_size,
            cached_policy,
        }
    }

    fn load_from_path(
        path_opt: Option<&Path>,
    ) -> (McpPolicyConfig, Option<SystemTime>, Option<u64>) {
        if let Some(path) = path_opt {
            if path.exists() {
                if let Ok(metadata) = fs::metadata(path) {
                    let mtime = metadata.modified().ok();
                    if let Ok(content) = fs::read_to_string(path) {
                        if let Ok(policy) = serde_json::from_str::<McpPolicyConfig>(&content) {
                            return (policy, mtime, Some(metadata.len()));
                        }
                    }
                }

                // A present but unreadable or malformed policy must never fall back to the
                // permissive first-run defaults. Keep every tool and repository closed until
                // a valid policy is written.
                return (Self::fail_closed_policy(), None, None);
            }
        }
        (McpPolicyConfig::default(), None, None)
    }

    fn fail_closed_policy() -> McpPolicyConfig {
        McpPolicyConfig {
            global_level: McpPermissionLevel::ReadOnly,
            allow_all_repos: false,
            allowed_repos: Vec::new(),
            enabled_tools: Vec::new(),
            allow_active_repo_fallback: false,
            ..McpPolicyConfig::default()
        }
    }

    pub fn reload_if_needed(&mut self) {
        if let Some(ref path) = self.policy_path {
            if path.exists() {
                if let Ok(metadata) = fs::metadata(path) {
                    let current_mtime = metadata.modified().ok();
                    let current_file_size = Some(metadata.len());
                    if current_mtime != self.last_modified
                        || current_file_size != self.last_file_size
                    {
                        // Retain the last known-good policy when an editor or writer leaves a
                        // transiently incomplete JSON file. This is both fail-closed and makes
                        // policy replacement safe for the next request.
                        if let Ok(content) = fs::read_to_string(path) {
                            if let Ok(new_policy) =
                                serde_json::from_str::<McpPolicyConfig>(&content)
                            {
                                self.cached_policy = new_policy;
                                self.last_modified = current_mtime;
                                self.last_file_size = current_file_size;
                            }
                        }
                    }
                }
            } else if self.last_modified.is_some() || self.last_file_size.is_some() {
                // Deleting a previously loaded policy is a revocation event, not a request to
                // restore permissive first-run defaults.
                self.cached_policy = Self::fail_closed_policy();
                self.last_modified = None;
                self.last_file_size = None;
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
        // `allow_all_repos` means every repository managed by GITBX, not every path on the
        // machine. The policy's repository rules are the server-side managed inventory; an
        // arbitrary client-supplied path must never bypass it.
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

    pub fn authorize_branch_creation(
        &mut self,
        repo_path: &str,
        branch_name: &str,
    ) -> Result<(), String> {
        let branch_name = branch_name.trim();
        if branch_name.is_empty() {
            return Err("Missing required argument 'name'".to_string());
        }

        if self.get_effective_level(repo_path) == McpPermissionLevel::SafeWrite
            && !branch_name.starts_with("feature/")
            && !branch_name.starts_with("fix/")
        {
            return Err(format!(
                "Permission Denied: SafeWrite may only create feature/* or fix/* branches, not '{branch_name}'."
            ));
        }

        Ok(())
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

        // 4. Remote policy checks. Fetch is allowed by the rule default, while push always
        // requires an explicit per-repository opt-in. Pull includes a fetch and therefore uses
        // the fetch flag in addition to its FullAccess permission-level requirement.
        let effective_rule = self.get_effective_rule(repo_path);
        if matches!(tool, "gitbx_fetch" | "gitbx_pull")
            && !effective_rule
                .as_ref()
                .map(|rule| rule.allow_remote_fetch)
                .unwrap_or(true)
        {
            return Err(
                "Permission Denied: Remote fetch/pull is disabled for this repository in GITBX MCP policy."
                    .to_string(),
            );
        }
        if tool == "gitbx_push"
            && !effective_rule
                .as_ref()
                .map(|rule| rule.allow_remote_push)
                .unwrap_or(false)
        {
            return Err(
                "Permission Denied: Remote push requires an explicit repository opt-in in GITBX MCP policy."
                    .to_string(),
            );
        }

        // 5. Branch protection check for actions that modify the current branch. Creating a
        // branch is intentionally exempt: it is the recovery path suggested to an agent when
        // the current branch is protected.
        if McpPermissionLevel::is_mutating_tool(tool) && tool != "gitbx_create_branch" {
            let protected_patterns = effective_rule
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

            // Branch protection must fail closed. If the repository or current branch cannot
            // be inspected, a write cannot be proven safe and is therefore rejected.
            let repo = GitService::open(repo_path).map_err(|error| {
                format!(
                    "Permission Denied: Unable to inspect repository branch before write: {error}"
                )
            })?;
            let branches = repo.list_branches(None).map_err(|error| {
                format!(
                    "Permission Denied: Unable to list repository branches before write: {error}"
                )
            })?;
            let current = branches
                .iter()
                .find(|branch| branch.is_head)
                .ok_or_else(|| {
                    "Permission Denied: Unable to determine the current branch before write."
                        .to_string()
                })?;
            if Self::is_branch_protected(&current.name, &protected_patterns) {
                return Err(format!(
                    "Permission Denied: Current branch '{}' is protected in GITBX. Please create a feature branch first.",
                    current.name
                ));
            }
        }

        Ok(())
    }
}

fn normalize_path(path_str: &str) -> String {
    let p = Path::new(path_str);
    let normalized = fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf());
    let s = normalized.to_string_lossy().replace('\\', "/");
    #[cfg(windows)]
    let s = s.to_lowercase();
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
    use std::fs;
    use tempfile::{tempdir, TempDir};

    fn engine_with_policy(policy: McpPolicyConfig) -> PolicyEngine {
        PolicyEngine {
            policy_path: None,
            last_modified: None,
            last_file_size: None,
            cached_policy: policy,
        }
    }

    fn policy_for_repo(
        repo_path: &str,
        level: McpPermissionLevel,
        tools: &[&str],
    ) -> McpPolicyConfig {
        McpPolicyConfig {
            global_level: level,
            allow_all_repos: false,
            allowed_repos: vec![McpRepoRule::new(repo_path)],
            enabled_tools: tools.iter().map(|tool| (*tool).to_string()).collect(),
            ..McpPolicyConfig::default()
        }
    }

    fn initialized_repo(branch: &str) -> TempDir {
        let directory = tempdir().expect("create temporary repository directory");
        let repo = gitbx_core::init_repo(directory.path(), false).expect("initialize repository");
        repo.inner()
            .set_head("refs/heads/main")
            .expect("set initial branch");
        fs::write(directory.path().join("README.md"), "initial\n").expect("write initial fixture");
        repo.stage_all().expect("stage initial fixture");
        repo.create_commit("initial", "MCP Test", "mcp@example.com")
            .expect("create initial commit");

        if branch != "main" {
            let repo_path = directory.path().to_string_lossy();
            GitService::create_branch(&repo_path, branch, None, true)
                .expect("create and check out test branch");
        }

        directory
    }

    fn write_policy(path: &Path, policy: &McpPolicyConfig) {
        fs::write(
            path,
            serde_json::to_vec_pretty(policy).expect("serialize policy fixture"),
        )
        .expect("write policy fixture");
    }

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
        assert!(!PolicyEngine::is_branch_protected(
            "feature/test",
            &patterns
        ));
        assert!(!PolicyEngine::is_branch_protected("fix/bug-1", &patterns));
        assert!(!PolicyEngine::is_branch_protected("release", &patterns));
        assert!(!PolicyEngine::is_branch_protected("main-backup", &patterns));
    }

    #[test]
    fn test_path_normalization() {
        let directory = tempdir().expect("create temporary directory");
        let nested = directory.path().join("nested");
        fs::create_dir(&nested).expect("create nested directory");
        let aliased = directory.path().join("nested").join("..").join("nested");
        assert_eq!(
            normalize_path(&nested.to_string_lossy()),
            normalize_path(&aliased.to_string_lossy())
        );

        #[cfg(windows)]
        assert_eq!(
            normalize_path("C:\\Users\\Admin\\repo\\"),
            normalize_path("c:/users/admin/repo")
        );

        #[cfg(not(windows))]
        assert_ne!(normalize_path("/tmp/Repo"), normalize_path("/tmp/repo"));
    }

    #[test]
    fn tool_whitelist_is_checked_before_repository_arguments() {
        let policy = McpPolicyConfig {
            enabled_tools: vec!["gitbx_list_repos".to_string(), "gitbx_status".to_string()],
            ..McpPolicyConfig::default()
        };
        let mut engine = engine_with_policy(policy);

        let disabled = engine
            .authorize_tool_call("gitbx_commit", None)
            .expect_err("disabled tool must be rejected");
        assert!(disabled.contains("disabled"));

        let missing_repo = engine
            .authorize_tool_call("gitbx_status", None)
            .expect_err("repository-bound tool must require repo_path");
        assert!(missing_repo.contains("repo_path"));
        assert!(engine.authorize_tool_call("gitbx_list_repos", None).is_ok());
    }

    #[test]
    fn test_repo_whitelist_and_override() {
        let mut rule = McpRepoRule::new("C:/test/repo");
        rule.override_level = Some(McpPermissionLevel::SafeWrite);
        let policy = McpPolicyConfig {
            allow_all_repos: false,
            global_level: McpPermissionLevel::ReadOnly,
            allowed_repos: vec![rule],
            ..McpPolicyConfig::default()
        };

        let mut engine = PolicyEngine {
            policy_path: None,
            last_modified: None,
            last_file_size: None,
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

        // Tool authorize tests. Read access does not require branch inspection.
        assert!(engine
            .authorize_tool_call("gitbx_status", Some("C:\\test\\repo"))
            .is_ok());
        assert!(engine
            .authorize_tool_call("gitbx_stage_file", Some("C:\\other\\repo"))
            .is_err());
        assert!(engine
            .authorize_tool_call("gitbx_reset", Some("C:\\test\\repo"))
            .is_err());
    }

    #[test]
    fn allow_all_repos_never_exposes_an_unmanaged_path() {
        let managed_path = "C:/managed/repository";
        let policy = McpPolicyConfig {
            allow_all_repos: true,
            allowed_repos: vec![McpRepoRule::new(managed_path)],
            ..McpPolicyConfig::default()
        };
        let mut engine = engine_with_policy(policy);

        assert!(engine.is_repo_allowed("C:\\managed\\repository"));
        assert!(!engine.is_repo_allowed("C:/unmanaged/repository"));
    }

    #[test]
    fn protected_branch_blocks_current_branch_writes_but_allows_escape_branch_creation() {
        let directory = initialized_repo("main");
        let repo_path = directory.path().to_string_lossy().into_owned();
        let mut policy = policy_for_repo(
            &repo_path,
            McpPermissionLevel::FullAccess,
            &[
                "gitbx_status",
                "gitbx_stage_all",
                "gitbx_commit",
                "gitbx_create_branch",
                "gitbx_reset",
                "gitbx_push",
            ],
        );
        policy.allowed_repos[0].allow_remote_push = true;
        let mut engine = engine_with_policy(policy);

        assert!(engine
            .authorize_tool_call("gitbx_status", Some(&repo_path))
            .is_ok());
        assert!(engine
            .authorize_tool_call("gitbx_create_branch", Some(&repo_path))
            .is_ok());

        for tool in [
            "gitbx_stage_all",
            "gitbx_commit",
            "gitbx_reset",
            "gitbx_push",
        ] {
            let error = engine
                .authorize_tool_call(tool, Some(&repo_path))
                .expect_err("current-branch mutation must be blocked");
            assert!(
                error.contains("branch 'main' is protected"),
                "{tool}: {error}"
            );
        }
    }

    #[test]
    fn safe_write_only_creates_feature_or_fix_branches() {
        let repo_path = "C:/managed/repository";
        let policy = policy_for_repo(
            repo_path,
            McpPermissionLevel::SafeWrite,
            &["gitbx_create_branch"],
        );
        let mut engine = engine_with_policy(policy);

        for name in ["feature/mcp-tests", "fix/mcp-policy"] {
            assert!(engine.authorize_branch_creation(repo_path, name).is_ok());
        }
        for name in ["", "main", "chore/dependencies", "featureless"] {
            assert!(engine.authorize_branch_creation(repo_path, name).is_err());
        }

        let full_access = policy_for_repo(
            repo_path,
            McpPermissionLevel::FullAccess,
            &["gitbx_create_branch"],
        );
        let mut engine = engine_with_policy(full_access);
        assert!(engine
            .authorize_branch_creation(repo_path, "chore/dependencies")
            .is_ok());
    }

    #[test]
    fn feature_branch_allows_writes_permitted_by_full_access() {
        let directory = initialized_repo("feature/mcp-tests");
        let repo_path = directory.path().to_string_lossy().into_owned();
        let mut policy = policy_for_repo(
            &repo_path,
            McpPermissionLevel::FullAccess,
            &[
                "gitbx_stage_all",
                "gitbx_commit",
                "gitbx_reset",
                "gitbx_push",
            ],
        );
        policy.allowed_repos[0].allow_remote_push = true;
        let mut engine = engine_with_policy(policy);

        for tool in [
            "gitbx_stage_all",
            "gitbx_commit",
            "gitbx_reset",
            "gitbx_push",
        ] {
            assert!(
                engine.authorize_tool_call(tool, Some(&repo_path)).is_ok(),
                "{tool} should be authorized on a feature branch"
            );
        }
    }

    #[test]
    fn write_authorization_fails_closed_when_current_branch_is_detached() {
        let directory = initialized_repo("feature/detached-head");
        let repo_path = directory.path().to_string_lossy().into_owned();
        let repo = GitService::open(&repo_path).expect("open test repository");
        let head_id = repo
            .inner()
            .head()
            .expect("read HEAD")
            .target()
            .expect("resolve HEAD target");
        repo.inner()
            .set_head_detached(head_id)
            .expect("detach HEAD");
        let mut engine = engine_with_policy(policy_for_repo(
            &repo_path,
            McpPermissionLevel::SafeWrite,
            &["gitbx_stage_all", "gitbx_create_branch"],
        ));

        let error = engine
            .authorize_tool_call("gitbx_stage_all", Some(&repo_path))
            .expect_err("write on detached HEAD must be rejected");
        assert!(error.contains("current branch"));
        assert!(engine
            .authorize_tool_call("gitbx_create_branch", Some(&repo_path))
            .is_ok());
    }

    #[test]
    fn remote_flags_are_enforced_and_push_requires_explicit_opt_in() {
        let directory = initialized_repo("feature/remote-policy");
        let repo_path = directory.path().to_string_lossy().into_owned();
        let mut policy = policy_for_repo(
            &repo_path,
            McpPermissionLevel::FullAccess,
            &["gitbx_fetch", "gitbx_pull", "gitbx_push"],
        );
        policy.allowed_repos[0].allow_remote_fetch = false;
        policy.allowed_repos[0].allow_remote_push = false;
        let mut engine = engine_with_policy(policy.clone());

        for tool in ["gitbx_fetch", "gitbx_pull", "gitbx_push"] {
            assert!(engine.authorize_tool_call(tool, Some(&repo_path)).is_err());
        }

        policy.allowed_repos[0].allow_remote_fetch = true;
        policy.allowed_repos[0].allow_remote_push = true;
        let mut engine = engine_with_policy(policy);
        for tool in ["gitbx_fetch", "gitbx_pull", "gitbx_push"] {
            assert!(engine.authorize_tool_call(tool, Some(&repo_path)).is_ok());
        }

        let allow_all_without_managed_repo = McpPolicyConfig {
            global_level: McpPermissionLevel::FullAccess,
            allow_all_repos: true,
            allowed_repos: Vec::new(),
            enabled_tools: vec!["gitbx_fetch".to_string(), "gitbx_push".to_string()],
            ..McpPolicyConfig::default()
        };
        let mut engine = engine_with_policy(allow_all_without_managed_repo);
        for tool in ["gitbx_fetch", "gitbx_push"] {
            let error = engine
                .authorize_tool_call(tool, Some(&repo_path))
                .expect_err("unmanaged repository must be rejected");
            assert!(error.contains("not authorized"));
        }
    }

    #[test]
    fn policy_file_hot_reload_applies_valid_updates_and_retains_last_known_good() {
        let directory = tempdir().expect("create temporary policy directory");
        let policy_path = directory.path().join("mcp-policy.json");
        let repo_path = "C:/managed/repo";

        let initial = policy_for_repo(repo_path, McpPermissionLevel::ReadOnly, &["gitbx_status"]);
        write_policy(&policy_path, &initial);
        let mut engine = PolicyEngine::with_custom_path(policy_path.clone());
        assert!(engine.is_tool_enabled("gitbx_status"));
        assert!(!engine.is_tool_enabled("gitbx_commit"));

        let updated = policy_for_repo(
            repo_path,
            McpPermissionLevel::SafeWrite,
            &["gitbx_status", "gitbx_commit"],
        );
        write_policy(&policy_path, &updated);
        assert!(engine.is_tool_enabled("gitbx_commit"));
        assert_eq!(
            engine.get_effective_level(repo_path),
            McpPermissionLevel::SafeWrite
        );

        fs::write(&policy_path, b"{ invalid json").expect("write malformed policy update");
        assert!(engine.is_tool_enabled("gitbx_commit"));
        assert_eq!(
            engine.get_effective_level(repo_path),
            McpPermissionLevel::SafeWrite
        );

        fs::remove_file(&policy_path).expect("delete policy fixture");
        assert!(!engine.is_tool_enabled("gitbx_commit"));
        assert!(!engine.get_policy().allow_all_repos);
    }

    #[test]
    fn malformed_initial_policy_fails_closed() {
        let directory = tempdir().expect("create temporary policy directory");
        let policy_path = directory.path().join("mcp-policy.json");
        fs::write(&policy_path, b"not-json").expect("write malformed policy fixture");

        let mut engine = PolicyEngine::with_custom_path(policy_path);
        let policy = engine.get_policy();
        assert_eq!(policy.global_level, McpPermissionLevel::ReadOnly);
        assert!(!policy.allow_all_repos);
        assert!(policy.allowed_repos.is_empty());
        assert!(policy.enabled_tools.is_empty());
        assert!(!policy.allow_active_repo_fallback);
    }
}
