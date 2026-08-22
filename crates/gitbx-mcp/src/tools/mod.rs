use gitbx_core::{open_repo, RepoStatusSummary, Result};
use serde_json::Value;

pub struct McpTools;

impl McpTools {
    pub fn get_status(repo_path: &str) -> anyhow::Result<Value> {
        let repo = open_repo(repo_path)?;
        let status = repo.get_status()?;
        Ok(serde_json::to_value(status)?)
    }

    pub fn get_branches(repo_path: &str) -> anyhow::Result<Value> {
        let repo = open_repo(repo_path)?;
        let branches = repo.list_branches(None)?;
        Ok(serde_json::to_value(branches)?)
    }

    pub fn stage_file(repo_path: &str, file_path: &str) -> anyhow::Result<Value> {
        let repo = open_repo(repo_path)?;
        repo.stage_file(file_path)?;
        Ok(serde_json::json!({ "success": true, "staged": file_path }))
    }

    pub fn commit(repo_path: &str, message: &str, author: &str, email: &str) -> anyhow::Result<Value> {
        let repo = open_repo(repo_path)?;
        let oid = repo.create_commit(message, author, email)?;
        Ok(serde_json::json!({ "success": true, "commit_id": oid }))
    }
}
