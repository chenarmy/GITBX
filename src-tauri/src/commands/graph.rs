use gitbx_core::open_repo;
use gitbx_graph::{GraphCommitNode, GraphLayoutEngine};

#[tauri::command]
pub async fn get_commit_graph(
    repo_path: String,
    max_count: Option<usize>,
) -> Result<Vec<GraphCommitNode>, String> {
    let repo = open_repo(&repo_path).map_err(|e| e.to_string())?;
    let commits = repo
        .get_commits(max_count.unwrap_or(200))
        .map_err(|e| e.to_string())?;
    let info = repo.info().map_err(|e| e.to_string())?;

    let nodes = GraphLayoutEngine::compute_layout(&commits, info.head_commit_id.as_deref());
    Ok(nodes)
}
