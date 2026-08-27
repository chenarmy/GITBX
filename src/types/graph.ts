export type EdgeType = 'Straight' | 'Fork' | 'Merge';

export type GraphDateRange = 'any' | 'today' | '7d' | '30d' | '90d';

export interface GraphFilters {
  query: string;
  branch: string;
  author: string;
  dateRange: GraphDateRange;
  path: string;
}

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
  containing_branch_refs: string[];
  tag_refs: string[];
  changed_paths: string[];
  is_head: boolean;
}

export interface GraphPage {
  nodes: GraphCommitNode[];
  offset: number;
  limit: number;
  has_more: boolean;
}
