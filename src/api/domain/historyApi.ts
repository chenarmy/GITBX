import { invoke } from '@tauri-apps/api/core';
import type {
  FileStatusItem,
  FileHistoryEntry,
  BlameLine,
  LocalHistoryEntry,
} from '@/types/git';
import type { GraphPage } from '@/types/graph';
import { isTauri, parseGitResponse } from '@/api/common';

export const getCommitGraph = async (
  repoPath: string,
  offset = 0,
  limit = 150,
): Promise<GraphPage> => {
  if (isTauri()) {
    return await invoke<GraphPage>('get_commit_graph', {
      repoPath,
      offset,
      limit,
    });
  }
  const params = new URLSearchParams({ path: repoPath, offset: String(offset), limit: String(limit) });
  const res = await fetch(`/api/repo/graph?${params.toString()}`);
  return await parseGitResponse<GraphPage>(res, 'Failed to load commit graph');
};

export const getCommitChanges = async (repoPath: string, commitId: string): Promise<FileStatusItem[]> => {
  if (isTauri()) {
    return await invoke<FileStatusItem[]>('get_commit_changes', { repoPath, commitId });
  }
  const res = await fetch(`/api/repo/commit-changes?path=${encodeURIComponent(repoPath)}&commit_id=${encodeURIComponent(commitId)}`);
  return await parseGitResponse<FileStatusItem[]>(res, 'Failed to fetch commit changes');
};

export const getFileHistory = async (
  repoPath: string,
  filePath: string,
  maxCount = 100,
): Promise<FileHistoryEntry[]> => {
  if (isTauri()) {
    return await invoke<FileHistoryEntry[]>('get_file_history', { repoPath, filePath, maxCount });
  }
  const params = new URLSearchParams({ path: repoPath, file_path: filePath, max_count: String(maxCount) });
  const res = await fetch(`/api/repo/file-history?${params.toString()}`);
  return await parseGitResponse<FileHistoryEntry[]>(res, 'Failed to load file history');
};

export const getFileBlame = async (
  repoPath: string,
  filePath: string,
  revision?: string,
): Promise<BlameLine[]> => {
  if (isTauri()) {
    return await invoke<BlameLine[]>('get_file_blame', { repoPath, filePath, revision: revision || null });
  }
  const params = new URLSearchParams({ path: repoPath, file_path: filePath });
  if (revision) params.set('revision', revision);
  const res = await fetch(`/api/repo/file-blame?${params.toString()}`);
  return await parseGitResponse<BlameLine[]>(res, 'Failed to load blame');
};

export const listLocalHistory = async (repoPath: string, filePath: string): Promise<LocalHistoryEntry[]> => {
  if (isTauri()) return await invoke<LocalHistoryEntry[]>('list_local_history', { repoPath, filePath });
  const params = new URLSearchParams({ path: repoPath, file_path: filePath });
  const res = await fetch(`/api/repo/local-history?${params.toString()}`);
  return await parseGitResponse<LocalHistoryEntry[]>(res, 'Failed to load local history');
};

export const createLocalHistorySnapshot = async (repoPath: string, filePath: string, label: string): Promise<LocalHistoryEntry> => {
  if (isTauri()) return await invoke<LocalHistoryEntry>('create_local_history_snapshot', { repoPath, filePath, label });
  const res = await fetch('/api/repo/local-history/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repo_path: repoPath, file_path: filePath, label }) });
  return await parseGitResponse<LocalHistoryEntry>(res, 'Failed to create local history snapshot');
};

export const restoreLocalHistory = async (repoPath: string, filePath: string, snapshotId: string): Promise<void> => {
  if (isTauri()) { await invoke('restore_local_history', { repoPath, filePath, snapshotId }); return; }
  const res = await fetch('/api/repo/local-history/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repo_path: repoPath, file_path: filePath, snapshot_id: snapshotId }) });
  await parseGitResponse(res, 'Failed to restore local history');
};

export const readLocalHistory = async (repoPath: string, filePath: string, snapshotId: string): Promise<string> => {
  if (isTauri()) return await invoke<string>('read_local_history', { repoPath, filePath, snapshotId });
  const params = new URLSearchParams({ path: repoPath, file_path: filePath, snapshot_id: snapshotId });
  const res = await fetch(`/api/repo/local-history/content?${params.toString()}`);
  return await parseGitResponse<string>(res, 'Failed to read local history');
};

export const resolveRevision = async (repoPath: string, revision: string): Promise<string> => {
  if (isTauri()) {
    return await invoke<string>('resolve_revision', { repoPath, revision });
  }
  const params = new URLSearchParams({ path: repoPath, revision });
  const res = await fetch(`/api/repo/resolve-revision?${params.toString()}`);
  return await parseGitResponse<string>(res, 'Revision was not found');
};

export const getBranchChanges = async (
  repoPath: string,
  baseRevision: string,
  targetRevision: string,
): Promise<FileStatusItem[]> => {
  if (isTauri()) {
    return await invoke<FileStatusItem[]>('get_branch_changes', {
      repoPath,
      baseRevision,
      targetRevision,
    });
  }
  const params = new URLSearchParams({
    path: repoPath,
    base_revision: baseRevision,
    target_revision: targetRevision,
  });
  const res = await fetch(`/api/repo/branch-changes?${params.toString()}`);
  return await parseGitResponse<FileStatusItem[]>(res, 'Failed to compare branches');
};
