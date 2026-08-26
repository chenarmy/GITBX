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
  is_reverting?: boolean;
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

export interface RemoteItem {
  name: string;
  url?: string;
  push_url?: string;
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

export interface FileHistoryEntry {
  id: string;
  short_id: string;
  summary: string;
  message: string;
  author_name: string;
  author_email: string;
  author_time: number;
  parent_ids: string[];
  branch_refs: string[];
  containing_branch_refs: string[];
  tag_refs: string[];
  changed_paths: string[];
}

export interface BlameLine {
  line_number: number;
  content: string;
  commit_id: string;
  short_id: string;
  author_name: string;
  author_email: string;
  author_time: number;
  summary: string;
}

export interface RebaseCommit {
  id: string;
  short_id: string;
  summary: string;
  author_name: string;
  author_time: number;
}

export type RebaseAction = 'pick' | 'reword' | 'squash' | 'fixup' | 'drop';
export interface RebasePlanItem {
  commit_id: string;
  action: RebaseAction;
  message?: string;
}

export interface SyncStatus {
  upstream?: string;
  incoming: RebaseCommit[];
  outgoing: RebaseCommit[];
}

export interface WorktreeInfo {
  path: string;
  head: string;
  branch?: string;
  is_main: boolean;
  is_detached: boolean;
  is_locked: boolean;
  lock_reason?: string;
  is_prunable: boolean;
}

export interface LocalHistoryEntry {
  id: string;
  file_path: string;
  timestamp: number;
  label: string;
  size: number;
}
