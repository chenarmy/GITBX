use serde::{Deserialize, Serialize};

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
    pub containing_branch_refs: Vec<String>,
    pub tag_refs: Vec<String>,
    pub changed_paths: Vec<String>,
    pub is_head: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphPage {
    pub nodes: Vec<GraphCommitNode>,
    pub offset: usize,
    pub limit: usize,
    pub has_more: bool,
}

pub struct LaneTracker {
    // lane_index -> expected next commit_id on this lane
    active_lanes: Vec<Option<String>>,
}

impl Default for LaneTracker {
    fn default() -> Self {
        Self::new()
    }
}

impl LaneTracker {
    pub fn new() -> Self {
        Self {
            active_lanes: Vec::new(),
        }
    }

    pub fn allocate_or_continue(&mut self, commit_id: &str) -> usize {
        if let Some(idx) = self.expected_lane(commit_id) {
            // A commit can be reached by more than one branch. Consume every
            // duplicate expectation so merged lanes actually close.
            for expected in &mut self.active_lanes {
                if expected.as_deref() == Some(commit_id) {
                    *expected = None;
                }
            }
            return idx;
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

    pub fn expected_lane(&self, commit_id: &str) -> Option<usize> {
        self.active_lanes
            .iter()
            .position(|expected| expected.as_deref() == Some(commit_id))
    }

    pub fn reserve_parent(&mut self, parent_id: &str, preferred_lane: Option<usize>) -> usize {
        if let Some(lane) = self.expected_lane(parent_id) {
            return lane;
        }

        if let Some(lane) = preferred_lane {
            if lane >= self.active_lanes.len() {
                self.active_lanes.resize(lane + 1, None);
            }
            if self.active_lanes[lane].is_none() {
                self.active_lanes[lane] = Some(parent_id.to_string());
                return lane;
            }
        }

        if let Some((lane, slot)) = self
            .active_lanes
            .iter_mut()
            .enumerate()
            .find(|(_, slot)| slot.is_none())
        {
            *slot = Some(parent_id.to_string());
            return lane;
        }

        let lane = self.active_lanes.len();
        self.active_lanes.push(Some(parent_id.to_string()));
        lane
    }
}
