use gitbx_core::open_repo;
use gitbx_graph::{GraphLayoutEngine, GraphPage};

#[tauri::command]
pub async fn get_commit_graph(
    repo_path: String,
    offset: Option<usize>,
    limit: Option<usize>,
) -> Result<GraphPage, String> {
    let repo = open_repo(&repo_path).map_err(|e| e.to_string())?;
    let offset = offset.unwrap_or(0);
    let limit = limit.unwrap_or(150).clamp(20, 500);
    let commits = repo
        .get_commits(offset.saturating_add(limit).saturating_add(1))
        .map_err(|e| e.to_string())?;
    let has_more = commits.len() > offset.saturating_add(limit);
    let info = repo.info().map_err(|e| e.to_string())?;
    let nodes = GraphLayoutEngine::compute_layout(&commits, info.head_commit_id.as_deref())
        .into_iter()
        .skip(offset)
        .take(limit)
        .collect();
    Ok(GraphPage {
        nodes,
        offset,
        limit,
        has_more,
    })
}
