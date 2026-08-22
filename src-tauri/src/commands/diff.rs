use gitbx_diff::{DiffEngine, FileDiff, Merge3Engine, ConflictChunk};
use std::fs;
use std::path::Path;

#[tauri::command]
pub async fn get_file_diff(
    repo_path: String,
    file_path: String,
    staged: bool,
) -> Result<FileDiff, String> {
    let full_path = Path::new(&repo_path).join(&file_path);
    let new_content = if full_path.exists() {
        fs::read_to_string(&full_path).unwrap_or_default()
    } else {
        String::new()
    };

    // For now we compute diff against empty or existing content
    let old_content = String::new(); // will be read from Git object in gitbx-core
    let diff = DiffEngine::diff_strings(&old_content, &new_content, Some(&file_path), Some(&file_path));
    Ok(diff)
}

#[tauri::command]
pub async fn parse_conflicts(content: String) -> Result<Vec<ConflictChunk>, String> {
    Ok(Merge3Engine::parse_conflicted_file(&content))
}
