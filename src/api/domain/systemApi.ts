import { invoke } from '@tauri-apps/api/core';
import type { WorktreeInfo } from '@/types/git';
import { isTauri, parseGitResponse, getConsole, gitbxFetch } from '@/api/common';

export const openSystemTerminal = async (repoPath: string): Promise<void> => {
  if (!isTauri()) {
    throw new Error('Opening a system terminal is only available in the desktop app.');
  }
  await invoke('open_system_terminal', { repoPath });
  getConsole().logInfo(`Opened a system terminal in ${repoPath}.`);
};

export const openFileManager = async (repoPath: string): Promise<void> => {
  if (!isTauri()) {
    throw new Error('Opening a file manager is only available in the desktop app.');
  }
  await invoke('open_file_manager', { repoPath });
  getConsole().logInfo(`Opened the file manager in ${repoPath}.`);
};

export const openInEditor = async (repoPath: string, editor: 'vscode' | 'idea'): Promise<void> => {
  if (!isTauri()) {
    throw new Error('Opening a code editor is only available in the desktop app.');
  }
  await invoke('open_in_editor', { repoPath, editor });
  getConsole().logInfo(`Opened ${repoPath} in ${editor === 'vscode' ? 'Visual Studio Code' : 'IntelliJ IDEA'}.`);
};

export const getRepositorySshKey = async (repoPath: string): Promise<string | null> => {
  if (!isTauri()) return null;
  return invoke<string | null>('get_repository_ssh_key', { repoPath });
};

export const setRepositorySshKey = async (repoPath: string, keyPath?: string): Promise<void> => {
  if (!isTauri()) {
    throw new Error('Repository SSH key management is only available in the desktop app.');
  }
  await invoke('set_repository_ssh_key', { repoPath, keyPath: keyPath?.trim() || null });
};

export const saveSshPassphrase = async (keyPath: string, passphrase: string): Promise<string> => {
  if (!isTauri()) {
    throw new Error('SSH passphrase storage is only available in the desktop app.');
  }
  return invoke<string>('save_ssh_passphrase', { keyPath, passphrase });
};

export const listWorktrees = async (repoPath: string): Promise<WorktreeInfo[]> => {
  if (isTauri()) return await invoke<WorktreeInfo[]>('list_worktrees', { repoPath });
  const res = await gitbxFetch(`/api/repo/worktrees?path=${encodeURIComponent(repoPath)}`);
  return await parseGitResponse<WorktreeInfo[]>(res, 'Failed to load worktrees');
};

export const createWorktree = async (repoPath: string, destination: string, branch: string): Promise<void> => {
  const cmd = `git worktree add "${destination}" "${branch}"`;
  getConsole().logCommand(cmd);
  if (isTauri()) {
    await invoke('worktree_add', { repoPath, destination, branch });
    getConsole().logSuccess(`Created worktree at ${destination}`);
    return;
  }
  const res = await gitbxFetch('/api/repo/worktree/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_path: repoPath, destination, branch }),
  });
  await parseGitResponse(res, 'Failed to create worktree');
  getConsole().logSuccess(`Created worktree at ${destination}`);
};

export const worktreeOperation = async (repoPath: string, endpoint: 'remove' | 'lock' | 'prune', body: Record<string, unknown> = {}): Promise<void> => {
  if (isTauri()) {
    if (endpoint === 'remove') await invoke('remove_worktree', { repoPath, worktreePath: body.worktree_path, force: body.force || false });
    else if (endpoint === 'lock') await invoke('set_worktree_locked', { repoPath, worktreePath: body.worktree_path, locked: body.locked, reason: body.reason || null });
    else await invoke('prune_worktrees', { repoPath });
    return;
  }
  const res = await gitbxFetch(`/api/repo/worktree/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repo_path: repoPath, ...body }) });
  await parseGitResponse(res, `Failed to ${endpoint} worktree`);
};

export const discoverGitRoots = async (repoPath: string): Promise<string[]> => {
  if (isTauri()) return await invoke<string[]>('discover_git_roots', { repoPath });
  const res = await gitbxFetch(`/api/repo/git-roots?path=${encodeURIComponent(repoPath)}`);
  return await parseGitResponse<string[]>(res, 'Failed to discover Git roots');
};

export const openPullRequest = async (repoPath: string, base: string, compare: string): Promise<void> => {
  if (isTauri()) { await invoke('open_pull_request', { repoPath, base, compare }); return; }
  const params = new URLSearchParams({ path: repoPath, base, compare });
  const res = await gitbxFetch(`/api/repo/pull-request-url?${params.toString()}`);
  const url = await parseGitResponse<string>(res, 'Failed to create pull request URL');
  window.open(url, '_blank', 'noopener,noreferrer');
};

export const removeWorktree = (repoPath: string, worktreePath: string, force = false): Promise<void> =>
  worktreeOperation(repoPath, 'remove', { worktree_path: worktreePath, force });

export const setWorktreeLocked = (
  repoPath: string,
  worktreePath: string,
  locked: boolean,
  reason?: string
): Promise<void> =>
  worktreeOperation(repoPath, 'lock', { worktree_path: worktreePath, locked, reason });

export const pruneWorktrees = (repoPath: string): Promise<void> =>
  worktreeOperation(repoPath, 'prune');

