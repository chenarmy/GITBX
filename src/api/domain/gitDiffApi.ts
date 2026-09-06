import { invoke } from '@tauri-apps/api/core';
import type { DiffResponse, ConflictFileContent } from '@/types/diff';
import { isTauri, parseGitResponse, getConsole } from '@/api/common';

export const getFileDiff = async (
  repoPath: string,
  filePath: string,
  staged = false,
  commitId?: string,
  comparison?: { baseCommitId: string; targetCommitId: string; oldFilePath?: string },
): Promise<DiffResponse> => {
  const params = new URLSearchParams({
    path: repoPath,
    file: filePath,
    staged: String(staged),
  });
  if (commitId) params.append('commit', commitId);
  if (comparison) {
    params.append('base_commit', comparison.baseCommitId);
    params.append('target_commit', comparison.targetCommitId);
    if (comparison.oldFilePath) params.append('old_file', comparison.oldFilePath);
  }
  if (isTauri()) {
    return await invoke<DiffResponse>('get_file_diff', {
      repoPath,
      filePath,
      staged,
      commitId: commitId || null,
      baseCommitId: comparison?.baseCommitId || null,
      targetCommitId: comparison?.targetCommitId || null,
      oldFilePath: comparison?.oldFilePath || null,
    });
  }
  const res = await fetch(`/api/repo/diff?${params.toString()}`);
  return await parseGitResponse<DiffResponse>(res, 'Failed to fetch diff');
};

export const getConflictFile = async (repoPath: string, filePath: string): Promise<ConflictFileContent> => {
  if (isTauri()) {
    return await invoke<ConflictFileContent>('get_conflict_file', { repoPath, filePath });
  }
  const params = new URLSearchParams({ path: repoPath, file_path: filePath });
  const res = await fetch(`/api/repo/conflict?${params.toString()}`);
  return await parseGitResponse<ConflictFileContent>(res, 'Failed to load conflict file');
};

export const resolveConflict = async (
  repoPath: string,
  filePath: string,
  options: { content?: string; side?: 'ours' | 'theirs' }
): Promise<void> => {
  if (isTauri()) {
    await invoke('resolve_conflict', {
      repoPath,
      filePath,
      content: options.content ?? null,
      side: options.side ?? null,
    });
    return;
  }
  const res = await fetch('/api/repo/conflict/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      repo_path: repoPath,
      file_path: filePath,
      content: options.content,
      side: options.side,
    }),
  });
  await parseGitResponse(res, 'Failed to resolve conflict');
};

export const applyPartialPatch = async (
  repoPath: string,
  filePath: string,
  patch: string,
  target: 'index' | 'workdir',
): Promise<void> => {
  const cmd = target === 'index'
    ? `git apply --cached <selected patch for "${filePath}">`
    : `git apply --reverse <selected patch for "${filePath}">`;
  getConsole().logCommand(cmd);
  if (isTauri()) {
    await invoke('apply_partial_patch', { repoPath, filePath, patch, target });
    return;
  }
  const res = await fetch('/api/repo/patch/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_path: repoPath, file_path: filePath, patch, target }),
  });
  await parseGitResponse(res, 'Failed to apply the selected patch');
};

export const createShelf = async (repoPath: string, message: string, filePaths: string[]): Promise<void> => {
  getConsole().logCommand(`git stash push -m "[Shelf] ${message}" -- ${filePaths.join(' ')}`);
  if (isTauri()) {
    await invoke('create_shelf', { repoPath, message, filePaths });
    return;
  }
  const res = await fetch('/api/repo/shelf/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_path: repoPath, message, file_paths: filePaths }),
  });
  await parseGitResponse(res, 'Failed to create shelf');
};
