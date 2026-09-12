use gitbx_core::{BlameLine, CommitDetail, GitService};
use gitbx_diff::{
    load_conflict_file, resolve_conflict_file, ConflictChunk, ConflictFileContent, FileDiff,
    Merge3Engine,
};
use std::fs;

#[tauri::command]
pub async fn get_file_diff(
    repo_path: String,
    file_path: String,
    staged: bool,
    commit_id: Option<String>,
    base_commit_id: Option<String>,
    target_commit_id: Option<String>,
    old_file_path: Option<String>,
) -> Result<FileDiff, String> {
    gitbx_diff::get_file_diff(
        &repo_path,
        &file_path,
        staged,
        commit_id.as_deref(),
        base_commit_id.as_deref(),
        target_commit_id.as_deref(),
        old_file_path.as_deref(),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn apply_partial_patch(
    repo_path: String,
    file_path: String,
    patch: String,
    target: String,
) -> Result<(), String> {
    GitService::apply_partial_patch(&repo_path, &file_path, &patch, &target)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_file_history(
    repo_path: String,
    file_path: String,
    max_count: Option<usize>,
) -> Result<Vec<CommitDetail>, String> {
    GitService::get_file_history(&repo_path, &file_path, max_count.unwrap_or(100))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_file_blame(
    repo_path: String,
    file_path: String,
    revision: Option<String>,
) -> Result<Vec<BlameLine>, String> {
    GitService::blame_file(&repo_path, &file_path, revision.as_deref())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn read_file(repo_path: String, file_path: String) -> Result<String, String> {
    let repo = GitService::open(&repo_path).map_err(|e| e.to_string())?;
    GitService::validate_file_path(&repo_path, &file_path).map_err(|e| e.to_string())?;
    let bytes = repo.workdir_file(&file_path).map_err(|e| e.to_string())?;
    String::from_utf8(bytes).map_err(|_| "Binary files cannot be edited as text".to_string())
}

#[tauri::command]
pub async fn write_file(
    repo_path: String,
    file_path: String,
    content: String,
) -> Result<(), String> {
    let path = GitService::validate_file_path(&repo_path, &file_path).map_err(|e| e.to_string())?;
    if path.exists() {
        let _ = GitService::create_local_history_snapshot(&repo_path, &file_path, "Before edit");
    }
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn parse_conflicts(content: String) -> Result<Vec<ConflictChunk>, String> {
    Ok(Merge3Engine::parse_conflicted_file(&content))
}

#[tauri::command]
pub async fn get_conflict_file(
    repo_path: String,
    file_path: String,
) -> Result<ConflictFileContent, String> {
    load_conflict_file(&repo_path, &file_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resolve_conflict(
    repo_path: String,
    file_path: String,
    content: Option<String>,
    side: Option<String>,
) -> Result<(), String> {
    resolve_conflict_file(&repo_path, &file_path, content.as_deref(), side.as_deref())
        .map_err(|e| e.to_string())
}
