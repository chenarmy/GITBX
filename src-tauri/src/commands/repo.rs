use gitbx_core::{
    open_repo, BranchItem, CommitDetail, RepoStatusSummary, RepositoryInfo, StashItem, TagItem,
};
use serde_json::Value;

#[tauri::command]
pub async fn get_repo_info(repo_path: String) -> Result<RepositoryInfo, String> {
    let repo = open_repo(&repo_path).map_err(|e| e.to_string())?;
    repo.info().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_repo_status(repo_path: String) -> Result<RepoStatusSummary, String> {
    let repo = open_repo(&repo_path).map_err(|e| e.to_string())?;
    repo.get_status().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_branches(repo_path: String) -> Result<Vec<BranchItem>, String> {
    let repo = open_repo(&repo_path).map_err(|e| e.to_string())?;
    repo.list_branches(None).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stage_file(repo_path: String, file_path: String) -> Result<(), String> {
    let repo = open_repo(&repo_path).map_err(|e| e.to_string())?;
    repo.stage_file(&file_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn unstage_file(repo_path: String, file_path: String) -> Result<(), String> {
    let repo = open_repo(&repo_path).map_err(|e| e.to_string())?;
    repo.unstage_file(&file_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stage_all(repo_path: String) -> Result<(), String> {
    let repo = open_repo(&repo_path).map_err(|e| e.to_string())?;
    repo.stage_all().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_commit(
    repo_path: String,
    message: String,
    author: String,
    email: String,
) -> Result<String, String> {
    let repo = open_repo(&repo_path).map_err(|e| e.to_string())?;
    repo.create_commit(&message, &author, &email)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn checkout_branch(repo_path: String, branch_name: String) -> Result<(), String> {
    let repo = open_repo(&repo_path).map_err(|e| e.to_string())?;
    repo.checkout_branch(&branch_name).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_branch(
    repo_path: String,
    name: String,
    target_commit_id: Option<String>,
) -> Result<(), String> {
    let repo = open_repo(&repo_path).map_err(|e| e.to_string())?;
    repo.create_branch(&name, target_commit_id.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_tags(repo_path: String) -> Result<Vec<TagItem>, String> {
    let repo = open_repo(&repo_path).map_err(|e| e.to_string())?;
    repo.list_tags().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_stashes(repo_path: String) -> Result<Vec<StashItem>, String> {
    let mut repo = open_repo(&repo_path).map_err(|e| e.to_string())?;
    repo.list_stashes().map_err(|e| e.to_string())
}
