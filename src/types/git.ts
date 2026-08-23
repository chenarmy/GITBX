export type DeltaType =
  | 'Unmodified'
  | 'Added'
  | 'Deleted'
  | 'Modified'
  | 'Renamed'
  | 'Typechange'
  | 'Conflicted'
  | 'Untracked'
  | 'Ignored';

export interface FileStatusItem {
  path: string;
  old_path?: string;
  staged_status: DeltaType;
  unstaged_status: DeltaType;
  is_staged: boolean;
  is_conflicted: boolean;
}

export interface RepoStatusSummary {
  staged_files: FileStatusItem[];
  unstaged_files: FileStatusItem[];
  untracked_files: FileStatusItem[];
  conflicted_files: FileStatusItem[];
  total_changes: number;
}

export interface RepositoryInfo {
  name: string;
  path: string;
  is_bare: boolean;
  head_branch?: string;
  head_commit_id?: string;
  is_dirty: boolean;
  remotes: string[];
  is_merging?: boolean;
  is_rebasing?: boolean;
  is_cherry_picking?: boolean;
}

export interface BranchItem {
  name: string;
  is_head: boolean;
  is_remote: boolean;
  target_commit_id: string;
  upstream_name?: string;
  ahead_count: number;
  behind_count: number;
}

export interface TagItem {
  name: string;
  target_commit_id: string;
  message?: string;
  tagger_name?: string;
  timestamp: number;
}

export interface StashItem {
  index: number;
  message: string;
  commit_id: string;
}
