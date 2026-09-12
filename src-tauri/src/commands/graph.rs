use gitbx_graph::{get_commit_graph_page, GraphPage};

#[tauri::command]
pub async fn get_commit_graph(
    repo_path: String,
    offset: Option<usize>,
    limit: Option<usize>,
) -> Result<GraphPage, String> {
    get_commit_graph_page(&repo_path, offset, limit).map_err(|e| e.to_string())
}
