use gitbx_core::GitService;
use gitbx_diff::DiffEngine;
use serde_json::Value;

pub struct McpTools;

impl McpTools {
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
            (
                old,
                String::from_utf8_lossy(&repo.index_file(file_path)?).into_owned(),
            )
        } else {
            (
                String::from_utf8_lossy(&repo.index_file(file_path)?).into_owned(),
                String::from_utf8_lossy(&repo.workdir_file(file_path)?).into_owned(),
            )
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
