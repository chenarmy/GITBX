use gitbx_core::GitService;
use gitbx_diff::DiffEngine;
use serde_json::Value;

pub struct McpTools;

impl McpTools {
    pub fn list_repos() -> anyhow::Result<Value> {
        let mut policy = crate::policy::global_policy()
            .lock()
            .map_err(|e| anyhow::anyhow!("Lock error: {e}"))?;
        let repos = policy.get_allowed_repo_paths();
        let allow_all = policy.get_policy().allow_all_repos;
        Ok(serde_json::json!({
            "repositories": repos,
            "allow_all": allow_all
        }))
    }

    pub fn get_status(repo_path: &str) -> anyhow::Result<Value> {
        let repo = GitService::open(repo_path)?;
        let status = repo.get_status()?;
        Ok(serde_json::to_value(status)?)
    }

    pub fn get_branches(repo_path: &str) -> anyhow::Result<Value> {
        let repo = GitService::open(repo_path)?;
        let branches = repo.list_branches(None)?;
        Ok(serde_json::to_value(branches)?)
    }

    pub fn get_log(repo_path: &str, max_count: usize) -> anyhow::Result<Value> {
        let repo = GitService::open(repo_path)?;
        Ok(serde_json::to_value(repo.get_commits(max_count.min(500))?)?)
    }

    pub fn get_tags(repo_path: &str) -> anyhow::Result<Value> {
        let repo = GitService::open(repo_path)?;
        Ok(serde_json::to_value(repo.list_tags()?)?)
    }

    pub fn stage_file(repo_path: &str, file_path: &str) -> anyhow::Result<Value> {
        GitService::validate_file_path(repo_path, file_path)?;
        GitService::with_write_lock(repo_path, |repo| repo.stage_file(file_path))?;
        Ok(serde_json::json!({ "success": true, "staged": file_path }))
    }

    pub fn stage_all(repo_path: &str) -> anyhow::Result<Value> {
        GitService::with_write_lock(repo_path, |repo| repo.stage_all())?;
        Ok(serde_json::json!({ "success": true }))
    }

    pub fn create_branch(repo_path: &str, name: &str, checkout: bool) -> anyhow::Result<Value> {
        GitService::create_branch(repo_path, name, None, checkout)?;
        Ok(serde_json::json!({ "success": true, "branch": name }))
    }

    pub fn get_diff(repo_path: &str, file_path: &str, staged: bool) -> anyhow::Result<Value> {
        GitService::validate_file_path(repo_path, file_path)?;
        let repo = GitService::open(repo_path)?;
        let (old, new) = if staged {
            let old = repo
                .inner()
                .head()
                .ok()
                .and_then(|head| head.peel_to_commit().ok())
                .and_then(|commit| {
                    commit
                        .tree()
                        .ok()?
                        .get_path(std::path::Path::new(file_path))
                        .ok()
                })
                .and_then(|entry| repo.inner().find_blob(entry.id()).ok())
                .map(|blob| String::from_utf8_lossy(blob.content()).into_owned())
                .unwrap_or_default();
            let new = repo
                .index_file(file_path)
                .map(|b| String::from_utf8_lossy(&b).into_owned())
                .unwrap_or_default();
            (old, new)
        } else {
            let old = repo
                .index_file(file_path)
                .or_else(|_| {
                    repo.inner()
                        .head()
                        .ok()
                        .and_then(|head| head.peel_to_commit().ok())
                        .and_then(|commit| {
                            commit
                                .tree()
                                .ok()?
                                .get_path(std::path::Path::new(file_path))
                                .ok()
                        })
                        .and_then(|entry| repo.inner().find_blob(entry.id()).ok())
                        .map(|blob| blob.content().to_vec())
                        .ok_or_else(|| {
                            gitbx_core::GitbxError::General("No previous version".into())
                        })
                })
                .map(|b| String::from_utf8_lossy(&b).into_owned())
                .unwrap_or_default();
            let new = repo
                .workdir_file(file_path)
                .map(|b| String::from_utf8_lossy(&b).into_owned())
                .unwrap_or_default();
            (old, new)
        };
        Ok(serde_json::to_value(DiffEngine::diff_strings(
            &old,
            &new,
            Some(file_path),
            Some(file_path),
        ))?)
    }

    pub fn merge(repo_path: &str, target: &str) -> anyhow::Result<Value> {
        GitService::merge(repo_path, target, false)?;
        Ok(serde_json::json!({ "success": true }))
    }

    pub fn rebase(repo_path: &str, upstream: &str) -> anyhow::Result<Value> {
        GitService::rebase(repo_path, upstream)?;
        Ok(serde_json::json!({ "success": true }))
    }

    pub fn cherry_pick(repo_path: &str, commit_id: &str) -> anyhow::Result<Value> {
        GitService::cherry_pick(repo_path, commit_id)?;
        Ok(serde_json::json!({ "success": true }))
    }

    pub fn reset(repo_path: &str, target: &str, mode: &str) -> anyhow::Result<Value> {
        GitService::reset(repo_path, target, mode)?;
        Ok(serde_json::json!({ "success": true }))
    }

    pub fn remote_operation(repo_path: &str, operation: &str) -> anyhow::Result<Value> {
        match operation {
            "fetch" => GitService::fetch_all(repo_path)?,
            "pull" => GitService::pull(repo_path, "origin")?,
            "push" => GitService::push(repo_path, "origin")?,
            _ => anyhow::bail!("Unknown remote operation: {operation}"),
        }
        Ok(serde_json::json!({ "success": true, "operation": operation }))
    }

    pub fn commit(
        repo_path: &str,
        message: &str,
        author: &str,
        email: &str,
    ) -> anyhow::Result<Value> {
        let oid = GitService::with_write_lock(repo_path, |repo| {
            repo.create_commit(message, author, email)
        })?;
        Ok(serde_json::json!({ "success": true, "commit_id": oid }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn status_diff_stage_and_commit_complete_a_local_git_round_trip() {
        let directory = tempdir().expect("create temporary repository directory");
        let repo = gitbx_core::init_repo(directory.path(), false).expect("initialize repository");
        repo.inner()
            .set_head("refs/heads/main")
            .expect("set initial branch");
        fs::write(directory.path().join("README.md"), "before\n").expect("write initial fixture");
        repo.stage_all().expect("stage initial fixture");
        repo.create_commit("initial", "MCP Test", "mcp@example.com")
            .expect("create initial commit");

        let repo_path = directory.path().to_string_lossy().into_owned();
        McpTools::create_branch(&repo_path, "feature/mcp-round-trip", true)
            .expect("create feature branch");
        fs::write(directory.path().join("README.md"), "after\n").expect("modify tracked fixture");

        let status = McpTools::get_status(&repo_path).expect("read dirty status");
        assert_eq!(status["total_changes"], 1);
        assert_eq!(status["unstaged_files"].as_array().map(Vec::len), Some(1));

        let unstaged_diff =
            McpTools::get_diff(&repo_path, "README.md", false).expect("read unstaged diff");
        assert!(!unstaged_diff["hunks"]
            .as_array()
            .expect("diff hunks")
            .is_empty());

        McpTools::stage_file(&repo_path, "README.md").expect("stage modified fixture");
        let staged_status = McpTools::get_status(&repo_path).expect("read staged status");
        assert_eq!(
            staged_status["staged_files"].as_array().map(Vec::len),
            Some(1)
        );
        let staged_diff =
            McpTools::get_diff(&repo_path, "README.md", true).expect("read staged diff");
        assert!(!staged_diff["hunks"]
            .as_array()
            .expect("staged diff hunks")
            .is_empty());

        let commit = McpTools::commit(
            &repo_path,
            "test(mcp): verify tool round trip",
            "MCP Test",
            "mcp@example.com",
        )
        .expect("commit staged fixture");
        assert_eq!(commit["success"], true);
        assert!(commit["commit_id"].as_str().is_some());

        let clean_status = McpTools::get_status(&repo_path).expect("read clean status");
        assert_eq!(clean_status["total_changes"], 0);
        let log = McpTools::get_log(&repo_path, 10).expect("read commit history");
        let commits = log.as_array().expect("commit array");
        assert_eq!(commits.len(), 2);
        assert_eq!(commits[0]["summary"], "test(mcp): verify tool round trip");
    }
}
