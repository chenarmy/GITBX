use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum EdgeType {
    Straight,
    Fork,
    Merge,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphEdge {
    pub from_lane: usize,
    pub to_lane: usize,
    pub parent_id: String,
    pub edge_type: EdgeType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphCommitNode {
    pub id: String,
    pub short_id: String,
    pub summary: String,
    pub author_name: String,
    pub author_time: i64,
    pub parent_ids: Vec<String>,
    pub lane: usize,
    pub edges: Vec<GraphEdge>,
    pub branch_refs: Vec<String>,
    pub tag_refs: Vec<String>,
    pub is_head: bool,
}

pub struct LaneTracker {
    // lane_index -> expected next commit_id on this lane
    active_lanes: Vec<Option<String>>,
}

impl LaneTracker {
    pub fn new() -> Self {
        Self {
            active_lanes: Vec::new(),
        }
    }

    pub fn allocate_or_continue(&mut self, commit_id: &str) -> usize {
        for (idx, expected) in self.active_lanes.iter_mut().enumerate() {
            if let Some(ref target) = expected {
                if target == commit_id {
                    *expected = None;
                    return idx;
                }
            }
        }

        // Find empty slot to reuse
        for (idx, slot) in self.active_lanes.iter_mut().enumerate() {
            if slot.is_none() {
                return idx;
            }
        }

        // Allocate new lane
        let new_idx = self.active_lanes.len();
        self.active_lanes.push(None);
        new_idx
    }

    pub fn set_expected(&mut self, lane: usize, parent_id: String) {
        if lane >= self.active_lanes.len() {
            self.active_lanes.resize(lane + 1, None);
        }
        self.active_lanes[lane] = Some(parent_id);
    }
}
