pub mod lane;
pub mod topology;

pub use lane::{EdgeType, GraphCommitNode, GraphEdge, GraphPage, LaneTracker};
pub use topology::GraphLayoutEngine;

use gitbx_core::{open_repo, GitbxError};

pub fn get_commit_graph_page(
    repo_path: &str,
    offset: Option<usize>,
    limit: Option<usize>,
) -> Result<GraphPage, GitbxError> {
    let repo = open_repo(repo_path)?;
    let offset = offset.unwrap_or(0);
    let limit = limit.unwrap_or(150).clamp(20, 500);
    let commits = repo.get_commits(offset.saturating_add(limit).saturating_add(1))?;
    let has_more = commits.len() > offset.saturating_add(limit);
    let info = repo.info()?;
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
