use gitbx_core::{BlameLine, CommitDetail, GitService};
use gitbx_diff::{
    load_conflict_file, resolve_conflict_file, ConflictChunk, ConflictFileContent, DiffEngine,
    FileDiff, Merge3Engine,
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
    let repo = GitService::open(&repo_path).map_err(|e| e.to_string())?;
    GitService::validate_file_path(&repo_path, &file_path).map_err(|e| e.to_string())?;

    let (old_bytes, new_bytes) = if let (Some(base_id), Some(target_id)) =
        (base_commit_id, target_commit_id)
    {
        let old_path = old_file_path.as_deref().unwrap_or(&file_path);
        let read_revision_file = |revision: &str, path: &str| -> Vec<u8> {
            repo.inner()
                .revparse_single(revision)
                .ok()
                .and_then(|object| object.peel_to_commit().ok())
                .and_then(|commit| {
                    commit
                        .tree()
                        .ok()?
                        .get_path(std::path::Path::new(path))
                        .ok()
                })
                .and_then(|entry| repo.inner().find_blob(entry.id()).ok())
                .map(|blob| blob.content().to_vec())
                .unwrap_or_default()
        };
        (
            read_revision_file(&base_id, old_path),
            read_revision_file(&target_id, &file_path),
        )
    } else if let Some(commit_id) = commit_id {
        let commit = repo
            .inner()
            .find_commit(git2::Oid::from_str(&commit_id).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        let old = commit
            .parent(0)
            .ok()
            .and_then(|parent| {
                parent
                    .tree()
                    .ok()?
                    .get_path(std::path::Path::new(&file_path))
                    .ok()
                    .and_then(|entry| {
                        repo.inner()
                            .find_blob(entry.id())
                            .ok()
                            .map(|blob| blob.content().to_vec())
                    })
            })
            .unwrap_or_default();
        let new = commit
            .tree()
            .ok()
            .and_then(|tree| tree.get_path(std::path::Path::new(&file_path)).ok())
            .and_then(|entry| {
                repo.inner()
                    .find_blob(entry.id())
                    .ok()
                    .map(|blob| blob.content().to_vec())
            })
            .unwrap_or_default();
        (old, new)
    } else if staged {
        let old = repo
            .inner()
            .head()
            .ok()
            .and_then(|head| head.peel_to_commit().ok())
            .and_then(|commit| {
                commit
                    .tree()
                    .ok()?
                    .get_path(std::path::Path::new(&file_path))
                    .ok()
                    .and_then(|entry| {
                        repo.inner()
                            .find_blob(entry.id())
                            .ok()
                            .map(|blob| blob.content().to_vec())
                    })
            })
            .unwrap_or_default();
        let new = repo.index_file(&file_path).unwrap_or_default();
        (old, new)
    } else {
        let old = repo
            .index_file(&file_path)
            .or_else(|_| {
                repo.inner()
                    .head()
                    .ok()
                    .and_then(|head| head.peel_to_commit().ok())
                    .and_then(|commit| {
                        commit
                            .tree()
                            .ok()?
                            .get_path(std::path::Path::new(&file_path))
                            .ok()
                            .and_then(|entry| {
                                repo.inner()
                                    .find_blob(entry.id())
                                    .ok()
                                    .map(|blob| blob.content().to_vec())
                            })
                    })
                    .ok_or_else(|| gitbx_core::GitbxError::General("No previous version".into()))
            })
            .unwrap_or_default();
        let new = repo.workdir_file(&file_path).unwrap_or_default();
        (old, new)
    };

    let is_binary =
        std::str::from_utf8(&old_bytes).is_err() || std::str::from_utf8(&new_bytes).is_err();
    if is_binary {
        return Ok(FileDiff {
            old_path: Some(file_path.clone()),
            new_path: Some(file_path),
            is_binary: true,
            hunks: Vec::new(),
            additions: 0,
            deletions: 0,
        });
    }
    let old_content = String::from_utf8_lossy(&old_bytes);
    let new_content = String::from_utf8_lossy(&new_bytes);
    Ok(DiffEngine::diff_strings(
        &old_content,
        &new_content,
        Some(old_file_path.as_deref().unwrap_or(&file_path)),
        Some(&file_path),
    ))
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
