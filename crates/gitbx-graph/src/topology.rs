use crate::lane::{EdgeType, GraphCommitNode, GraphEdge, LaneTracker};
use gitbx_core::CommitDetail;
use std::collections::HashMap;

pub struct GraphLayoutEngine;

impl GraphLayoutEngine {
    pub fn compute_layout(
        commits: &[CommitDetail],
        head_commit_id: Option<&str>,
    ) -> Vec<GraphCommitNode> {
        let mut tracker = LaneTracker::new();
        let mut nodes = Vec::with_capacity(commits.len());

        let mut commit_index_map: HashMap<&str, usize> = HashMap::new();
        for (i, c) in commits.iter().enumerate() {
            commit_index_map.insert(&c.id, i);
        }

        for c in commits.iter() {
            let current_lane = tracker.allocate_or_continue(&c.id);
            let mut edges = Vec::new();

            for (p_idx, parent_id) in c.parent_ids.iter().enumerate() {
                if p_idx == 0 {
                    // First parent: continues on same lane or allocates
                    tracker.set_expected(current_lane, parent_id.clone());
                    edges.push(GraphEdge {
                        from_lane: current_lane,
                        to_lane: current_lane,
                        parent_id: parent_id.clone(),
                        edge_type: EdgeType::Straight,
                    });
                } else {
                    // Secondary parent (Merge): branch off
                    let merge_lane = tracker.allocate_or_continue(parent_id);
                    tracker.set_expected(merge_lane, parent_id.clone());
                    edges.push(GraphEdge {
                        from_lane: current_lane,
                        to_lane: merge_lane,
                        parent_id: parent_id.clone(),
                        edge_type: EdgeType::Merge,
                    });
                }
            }

            let is_head = head_commit_id.map(|h| h == c.id).unwrap_or(false);

            nodes.push(GraphCommitNode {
                id: c.id.clone(),
                short_id: c.short_id.clone(),
                summary: c.summary.clone(),
                author_name: c.author_name.clone(),
                author_time: c.author_time,
                parent_ids: c.parent_ids.clone(),
                lane: current_lane,
                edges,
                branch_refs: c.branch_refs.clone(),
                containing_branch_refs: c.containing_branch_refs.clone(),
                tag_refs: c.tag_refs.clone(),
                changed_paths: c.changed_paths.clone(),
                is_head,
            });
        }

        nodes
    }
}

#[cfg(test)]
mod tests {
    use super::GraphLayoutEngine;
    use gitbx_core::CommitDetail;

    fn commit(id: &str, parents: Vec<&str>) -> CommitDetail {
        CommitDetail {
            id: id.into(),
            short_id: id[..4].into(),
            parent_ids: parents.into_iter().map(str::to_string).collect(),
            author_name: "Test".into(),
            author_email: "test@example.com".into(),
            author_time: 0,
            committer_name: "Test".into(),
            committer_email: "test@example.com".into(),
            committer_time: 0,
            summary: id.into(),
            body: None,
            branch_refs: Vec::new(),
            containing_branch_refs: Vec::new(),
            tag_refs: Vec::new(),
            changed_paths: Vec::new(),
        }
    }

    #[test]
    fn lays_out_merge_parent_edges() {
        let commits = vec![
            commit("abcd", vec!["bcde", "cdef"]),
            commit("bcde", vec!["cdef"]),
            commit("cdef", vec![]),
        ];
        let nodes = GraphLayoutEngine::compute_layout(&commits, Some("abcd"));
        assert_eq!(nodes.len(), 3);
        assert!(nodes[0].is_head);
        assert_eq!(nodes[0].edges.len(), 2);
    }
}
