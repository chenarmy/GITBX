export type EdgeType = 'Straight' | 'Fork' | 'Merge';

export interface GraphEdge {
  from_lane: number;
  to_lane: number;
  parent_id: string;
  edge_type: EdgeType;
}

export interface GraphCommitNode {
  id: string;
  short_id: string;
  summary: string;
  author_name: string;
  author_time: number;
  parent_ids: string[];
  lane: number;
  edges: GraphEdge[];
  branch_refs: string[];
  tag_refs: string[];
  is_head: boolean;
}
