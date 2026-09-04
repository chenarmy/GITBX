import { invoke } from '@tauri-apps/api/core';
import type {
  RepositoryInfo,
  RepoStatusSummary,
  FileStatusItem,
  BranchItem,
  RemoteItem,
  TagItem,
  StashItem,
  FileHistoryEntry,
  BlameLine,
  RebaseCommit,
  RebasePlanItem,
  SyncStatus,
  WorktreeInfo,
  LocalHistoryEntry,
} from '@/types/git';
import type { GraphPage } from '@/types/graph';
import type { ConflictFileContent } from '@/types/diff';
import type {
  LlmConfig,
  GeneratedCommitMessage,
  SecretDetection,
  ConflictResolutionSuggestion,
} from '@/types/ai';
import type { Locale } from '@/i18n/config';
import { useConsoleStore } from '@/stores/console';

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function formatGitError(error: unknown, fallback = 'Git operation failed'): string {
  if (typeof error === 'string' && error.trim()) return error;
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>;
    for (const key of ['message', 'detail', 'error', 'description']) {
      const nested = value[key];
      if (typeof nested === 'string' && nested.trim()) return nested;
      if (nested && nested !== error) {
        const formatted = formatGitError(nested, '');
        if (formatted) return formatted;
      }
    }
    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== '{}') return serialized;
    } catch {
      // Fall through to the stable fallback.
    }
  }
  return fallback;
}

export function isNonFastForwardPushError(error: unknown): boolean {
  const message = formatGitError(error, '').toLowerCase();
  if (!message) return false;
  return message.includes('non-fast-forward')
    || message.includes('(fetch first)')
    || (
      (message.includes('updates were rejected') || message.includes('failed to push some refs'))
      && (
        message.includes('tip of your current branch is behind')
        || message.includes('remote contains work')
        || message.includes('fetch first')
      )
    );
}

async function parseGitResponse<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.error) {
    throw new Error(formatGitError(data, `${fallback} (HTTP ${res.status})`));
  }
  return data as T;
}

async function parseOperationResult(
  res: Response,
  fallback: string
): Promise<{ success: boolean; conflict?: boolean; error?: string; output?: string }> {
  const data = await res.json().catch(() => null);
  if (res.ok && data?.success) return data;
  const error = data?.error ?? data;
  return {
    success: false,
    conflict: Boolean(error?.conflict),
    error: formatGitError(error, `${fallback} (HTTP ${res.status})`),
  };
}

function isConflictError(error: unknown): boolean {
  return /conflict|unmerged/i.test(formatGitError(error, ''));
}

function redactRemoteUrl(url: string): string {
  return url.replace(/(https?:\/\/)([^\s/@:]+)(?::[^\s/@]*)?@/i, '$1$2:***@');
}

export function useGitApi() {
  const getConsole = () => useConsoleStore();

  const validateRepo = async (repoPath: string): Promise<{ valid: boolean; path?: string; name?: string; message?: string }> => {
    getConsole().logCommand(`git rev-parse --show-toplevel (in ${repoPath})`);
    if (isTauri()) {
      try {
        const info = await invoke<RepositoryInfo>('get_repo_info', { repoPath });
        return { valid: true, path: info.path, name: info.name };
      } catch (err: any) {
        return { valid: false, message: err.toString() };
      }
    }
    const res = await fetch('/api/repo/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: repoPath }),
    });
    return await res.json();
  };

  const initRepo = async (repoPath: string): Promise<{ success: boolean; path: string; name: string }> => {
    getConsole().logCommand(`git init "${repoPath}"`);
    if (isTauri()) {
      const info = await invoke<RepositoryInfo>('init_repo', { repoPath });
      getConsole().logSuccess(`Initialized Git repository in ${repoPath}`);
      return { success: true, path: info.path, name: info.name };
    }
    const res = await fetch('/api/repo/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: repoPath }),
    });
    const data = await res.json();
    if (data.success) {
      getConsole().logSuccess(`Initialized empty Git repository in ${repoPath}`);
    } else {
      getConsole().logError(`Failed to initialize repo: ${data.error}`);
    }
    return data;
  };

  const cloneRepo = async (url: string, destination: string): Promise<{ success: boolean; path: string; name: string }> => {
    getConsole().logCommand(`git clone "${redactRemoteUrl(url)}" "${destination}"`);
    if (isTauri()) {
      const info = await invoke<RepositoryInfo>('clone_repo', { url, destination });
      getConsole().logSuccess(`Cloned ${redactRemoteUrl(url)} into ${destination}`);
      return { success: true, path: info.path, name: info.name };
    }
    const res = await fetch('/api/repo/clone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, destination }),
    });
    const data = await res.json();
    if (data.success) {
      getConsole().logSuccess(`Cloned ${redactRemoteUrl(url)} into ${destination}`);
    } else {
      getConsole().logError(`Clone failed: ${data.error}`);
    }
    return data;
  };

  const getRepoInfo = async (repoPath: string): Promise<RepositoryInfo> => {
    if (isTauri()) {
      return await invoke<RepositoryInfo>('get_repo_info', { repoPath });
    }
    const res = await fetch(`/api/repo/info?path=${encodeURIComponent(repoPath)}`);
    return await parseGitResponse<RepositoryInfo>(res, 'Failed to load repository information');
  };

  const getRepoStatus = async (repoPath: string): Promise<RepoStatusSummary> => {
    if (isTauri()) {
      return await invoke<RepoStatusSummary>('get_repo_status', { repoPath });
    }
    const res = await fetch(`/api/repo/status?path=${encodeURIComponent(repoPath)}`);
    return await parseGitResponse<RepoStatusSummary>(res, 'Failed to load repository status');
  };

  const listBranches = async (repoPath: string): Promise<BranchItem[]> => {
    if (isTauri()) {
      return await invoke<BranchItem[]>('list_branches', { repoPath });
    }
    const res = await fetch(`/api/repo/branches?path=${encodeURIComponent(repoPath)}`);
    return await parseGitResponse<BranchItem[]>(res, 'Failed to load branches');
  };

  const listRemotes = async (repoPath: string): Promise<RemoteItem[]> => {
    if (isTauri()) {
      return await invoke<RemoteItem[]>('list_remotes', { repoPath });
    }
    const res = await fetch(`/api/repo/remotes?path=${encodeURIComponent(repoPath)}`);
    return await parseGitResponse<RemoteItem[]>(res, 'Failed to load remotes');
  };

  const setRemoteUrl = async (
    repoPath: string,
    remoteName: string,
    url: string,
    pushUrl?: string,
  ): Promise<void> => {
    const fetchUrl = url.trim();
    const separatePushUrl = pushUrl?.trim() || undefined;
    const cmd = `git remote set-url "${remoteName}" "${fetchUrl}"`;
    getConsole().logCommand(cmd);

    if (isTauri()) {
      try {
        await invoke('set_remote_url', {
          repoPath,
          remoteName,
          url: fetchUrl,
          pushUrl: separatePushUrl,
        });
        getConsole().logSuccess(`Remote '${remoteName}' URL updated.`);
        return;
      } catch (error) {
        const message = formatGitError(error, `Failed to update remote '${remoteName}'`);
        getConsole().logError(message, undefined, cmd);
        throw new Error(message);
      }
    }

    const res = await fetch('/api/repo/remote/set-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo_path: repoPath,
        remote_name: remoteName,
        url: fetchUrl,
        push_url: separatePushUrl,
      }),
    });
    try {
      await parseGitResponse<unknown>(res, `Failed to update remote '${remoteName}'`);
    } catch (error) {
      const message = formatGitError(error, `Failed to update remote '${remoteName}'`);
      getConsole().logError(message, undefined, cmd);
      throw new Error(message);
    }
    getConsole().logSuccess(`Remote '${remoteName}' URL updated.`);
  };

  const createBranch = async (
    repoPath: string,
    name: string,
    startPoint?: string,
    checkout: boolean = true
  ): Promise<void> => {
    const cmd = checkout
      ? `git checkout -b "${name}"${startPoint ? ` "${startPoint}"` : ''}`
      : `git branch "${name}"${startPoint ? ` "${startPoint}"` : ''}`;
    getConsole().logCommand(cmd);

    if (isTauri()) {
      await invoke('create_branch', { repoPath, name, targetCommitId: startPoint });
      getConsole().logSuccess(`Branch '${name}' created.`);
      return;
    }
    const res = await fetch('/api/repo/branch/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, name, start_point: startPoint, checkout }),
    });
    const data = await res.json();
    if (data.error) {
      getConsole().logError(data.error, undefined, cmd);
      throw new Error(data.error);
    }
    getConsole().logSuccess(`Branch '${name}' created successfully.`);
  };

  const checkoutBranch = async (repoPath: string, name: string): Promise<void> => {
    const cmd = `git checkout "${name}"`;
    getConsole().logCommand(cmd);

    if (isTauri()) {
      await invoke('checkout_branch', { repoPath, branchName: name });
      getConsole().logSuccess(`Switched to branch '${name}'.`);
      return;
    }
    const res = await fetch('/api/repo/branch/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, name }),
    });
    const data = await res.json();
    if (data.error) {
      getConsole().logError(data.error, undefined, cmd);
      throw new Error(data.error);
    }
    getConsole().logSuccess(`Switched to branch '${name}'.`);
  };

  const renameBranch = async (repoPath: string, oldName: string, newName: string): Promise<void> => {
    const cmd = `git branch -m "${oldName}" "${newName}"`;
    getConsole().logCommand(cmd);
    if (isTauri()) {
      await invoke('rename_branch', { repoPath, oldName, newName });
      getConsole().logSuccess(`Renamed branch '${oldName}' to '${newName}'.`);
      return;
    }
    const res = await fetch('/api/repo/branch/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, old_name: oldName, new_name: newName }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    getConsole().logSuccess(`Renamed branch '${oldName}' to '${newName}'.`);
  };

  const deleteBranch = async (repoPath: string, name: string, force = false): Promise<void> => {
    const cmd = `git branch ${force ? '-D' : '-d'} "${name}"`;
    getConsole().logCommand(cmd);
    if (isTauri()) {
      await invoke('delete_branch', { repoPath, name, force });
      getConsole().logSuccess(`Deleted branch '${name}'.`);
      return;
    }
    const res = await fetch('/api/repo/branch/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, name, force }),
    });
    const data = await res.json();
    if (data.error) {
      getConsole().logError(data.error, undefined, cmd);
      throw new Error(data.error);
    }
    getConsole().logSuccess(`Deleted branch '${name}'.`);
  };

  const getCommitGraph = async (
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

  const listTags = async (repoPath: string): Promise<TagItem[]> => {
    if (isTauri()) {
      return await invoke<TagItem[]>('list_tags', { repoPath });
    }
    const res = await fetch(`/api/repo/tags?path=${encodeURIComponent(repoPath)}`);
    return await parseGitResponse<TagItem[]>(res, 'Failed to load tags');
  };

  const createTag = async (
    repoPath: string,
    name: string,
    message?: string,
    commitId?: string
  ): Promise<void> => {
    const cmd = `git tag "${name}"${message ? ` -m "${message}"` : ''}${commitId ? ` "${commitId}"` : ''}`;
    getConsole().logCommand(cmd);
    if (isTauri()) {
      await invoke('create_tag', { repoPath, name, message, commitId });
      getConsole().logSuccess(`Tag '${name}' created.`);
      return;
    }
    const res = await fetch('/api/repo/tag/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, name, message, commit_id: commitId }),
    });
    const data = await res.json();
    if (data.error) {
      getConsole().logError(data.error, undefined, cmd);
      throw new Error(data.error);
    }
    getConsole().logSuccess(`Tag '${name}' created.`);
  };

  const listStashes = async (repoPath: string): Promise<StashItem[]> => {
    if (isTauri()) {
      return await invoke<StashItem[]>('list_stashes', { repoPath });
    }
    const res = await fetch(`/api/repo/stashes?path=${encodeURIComponent(repoPath)}`);
    return await parseGitResponse<StashItem[]>(res, 'Failed to load stashes');
  };

  const createStash = async (repoPath: string, message?: string): Promise<void> => {
    const cmd = `git stash${message ? ` push -m "${message}"` : ''}`;
    getConsole().logCommand(cmd);
    if (isTauri()) {
      await invoke('create_stash', { repoPath, message });
      getConsole().logSuccess('Saved working directory and index state to stash.');
      return;
    }
    const res = await fetch('/api/repo/stash/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, message }),
    });
    const data = await res.json();
    if (data.error) {
      getConsole().logError(data.error, undefined, cmd);
      throw new Error(data.error);
    }
    getConsole().logSuccess(`Saved working directory and index state to stash.`);
  };

  const popStash = async (repoPath: string, index = 0): Promise<void> => {
    const cmd = `git stash pop stash@{${index}}`;
    getConsole().logCommand(cmd);
    if (isTauri()) {
      await invoke('pop_stash', { repoPath, index });
      getConsole().logSuccess(`Applied stash@{${index}}.`);
      return;
    }
    const res = await fetch('/api/repo/stash/pop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, index }),
    });
    const data = await res.json();
    if (data.error) {
      getConsole().logError(data.error, undefined, cmd);
      throw new Error(data.error);
    }
    getConsole().logSuccess(`Dropped stash@{${index}} and applied changes.`);
  };

  const stageFile = async (repoPath: string, filePath: string): Promise<void> => {
    const cmd = `git add "${filePath}"`;
    getConsole().logCommand(cmd);
    if (isTauri()) {
      await invoke('stage_file', { repoPath, filePath });
      return;
    }
    await fetch('/api/repo/stage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, file_path: filePath }),
    });
  };

  const stageAll = async (repoPath: string): Promise<void> => {
    const cmd = `git add -A`;
    getConsole().logCommand(cmd);
    if (isTauri()) {
      await invoke('stage_all', { repoPath });
      return;
    }
    await fetch('/api/repo/stage-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath }),
    });
    getConsole().logSuccess('All changes staged.');
  };

  const unstageFile = async (repoPath: string, filePath: string): Promise<void> => {
    const cmd = `git restore --staged "${filePath}"`;
    getConsole().logCommand(cmd);
    if (isTauri()) {
      await invoke('unstage_file', { repoPath, filePath });
      return;
    }
    await fetch('/api/repo/unstage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, file_path: filePath }),
    });
  };

  const unstageAll = async (repoPath: string): Promise<void> => {
    const cmd = `git restore --staged .`;
    getConsole().logCommand(cmd);
    if (isTauri()) {
      await invoke('unstage_all', { repoPath });
      getConsole().logSuccess('All changes unstaged.');
      return;
    }
    await fetch('/api/repo/unstage-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath }),
    });
    getConsole().logSuccess('All changes unstaged.');
  };

  const discardFile = async (repoPath: string, filePath?: string): Promise<void> => {
    const cmd = filePath ? `git restore "${filePath}"` : `git restore . && git clean -fd`;
    getConsole().logCommand(cmd);
    if (isTauri()) {
      await invoke('discard_file', { repoPath, filePath: filePath || null });
      getConsole().logWarning(`Discarded changes: ${filePath || 'All files'}`);
      return;
    }
    await fetch('/api/repo/discard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, file_path: filePath }),
    });
    getConsole().logWarning(`Discarded changes: ${filePath || 'All files'}`);
  };

  const createCommit = async (
    repoPath: string,
    message: string,
    author: string,
    email: string,
    options: { amend?: boolean; sign?: boolean; preCommitCommand?: string } = {},
  ): Promise<string> => {
    const cmd = `git commit -m "${message}" --author="${author} <${email}>"`;
    getConsole().logCommand(cmd);

    if (isTauri()) {
      const cid = await invoke<string>('create_commit', {
        repoPath,
        message,
        author,
        email,
        amend: options.amend || false,
        sign: options.sign || false,
        preCommitCommand: options.preCommitCommand || null,
      });
      getConsole().logSuccess(`Commit ${cid.slice(0, 7)} created: ${message}`);
      return cid;
    }
    const res = await fetch('/api/repo/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, message, author, email, amend: options.amend, sign: options.sign, pre_commit_command: options.preCommitCommand }),
    });
    const data = await res.json();
    if (data.error) {
      getConsole().logError(data.error, undefined, cmd);
      throw new Error(data.error);
    }
    getConsole().logSuccess(`Commit created successfully: ${message}`, data.output);
    return data.commit_id;
  };

  const commitAndPush = async (
    repoPath: string,
    message: string,
    author: string,
    email: string,
  ): Promise<string> => {
    const cmd = `git add -A && git commit -m "${message}" && git push -u origin HEAD`;
    getConsole().logCommand(cmd);
    if (isTauri()) {
      const cid = await invoke<string>('commit_and_push', { repoPath, message, author, email });
      getConsole().logSuccess(`Commit ${cid.slice(0, 7)} created and pushed.`);
      return cid;
    }
    const res = await fetch('/api/repo/commit-and-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, message, author, email }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.error || !data?.success) {
      const error = formatGitError(data?.error ?? data, `Commit and push failed (HTTP ${res.status})`);
      getConsole().logError(error, undefined, cmd);
      throw new Error(error);
    }
    getConsole().logSuccess(`Commit ${data.commit_id.slice(0, 7)} created and pushed.`);
    return data.commit_id;
  };

  const getFileDiff = async (
    repoPath: string,
    filePath: string,
    staged = false,
    commitId?: string,
    comparison?: { baseCommitId: string; targetCommitId: string; oldFilePath?: string },
  ): Promise<any> => {
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
      return await invoke('get_file_diff', {
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
    return await res.json();
  };

  const getCommitTemplate = async (repoPath: string): Promise<string | null> => {
    if (isTauri()) return await invoke<string | null>('get_commit_template', { repoPath });
    const res = await fetch(`/api/repo/commit-template?path=${encodeURIComponent(repoPath)}`);
    return await parseGitResponse<string | null>(res, 'Failed to load commit template');
  };

  const stashOperation = async (repoPath: string, operation: 'apply' | 'drop' | 'rename', index: number, message?: string): Promise<void> => {
    const cmd = `git stash ${operation} stash@{${index}}`;
    getConsole().logCommand(cmd);
    if (isTauri()) {
      if (operation === 'rename') await invoke('rename_stash', { repoPath, index, message: message || '' });
      else await invoke(`${operation}_stash`, { repoPath, index });
      return;
    }
    const res = await fetch(`/api/repo/stash/${operation}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, index, message }),
    });
    await parseGitResponse(res, `Failed to ${operation} stash`);
  };

  const getStashChanges = async (repoPath: string, commitId: string): Promise<FileStatusItem[]> => {
    if (isTauri()) return await invoke<FileStatusItem[]>('get_stash_changes', { repoPath, commitId });
    const params = new URLSearchParams({ path: repoPath, commit_id: commitId });
    const res = await fetch(`/api/repo/stash/changes?${params.toString()}`);
    return await parseGitResponse<FileStatusItem[]>(res, 'Failed to load stash changes');
  };

  const createShelf = async (repoPath: string, message: string, filePaths: string[]): Promise<void> => {
    getConsole().logCommand(`git stash push -m "[Shelf] ${message}" -- ${filePaths.join(' ')}`);
    if (isTauri()) {
      await invoke('create_shelf', { repoPath, message, filePaths });
      return;
    }
    const res = await fetch('/api/repo/shelf/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, message, file_paths: filePaths }),
    });
    await parseGitResponse(res, 'Failed to create shelf');
  };

  const applyPartialPatch = async (
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

  const getFileHistory = async (
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

  const getFileBlame = async (
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

  const getConflictFile = async (repoPath: string, filePath: string): Promise<ConflictFileContent> => {
    if (isTauri()) {
      return await invoke<ConflictFileContent>('get_conflict_file', { repoPath, filePath });
    }
    const params = new URLSearchParams({ path: repoPath, file_path: filePath });
    const res = await fetch(`/api/repo/conflict?${params.toString()}`);
    return await parseGitResponse<ConflictFileContent>(res, 'Failed to load conflict file');
  };

  const resolveConflict = async (
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

  const mergeBranch = async (
    repoPath: string,
    target: string,
    strategy: 'default' | 'no-ff' | 'squash' | 'ff-only' = 'default',
    message?: string
  ): Promise<{ success: boolean; conflict?: boolean; error?: string }> => {
    const flag = strategy === 'no-ff' ? ' --no-ff' : strategy === 'squash' ? ' --squash' : strategy === 'ff-only' ? ' --ff-only' : '';
    const cmd = `git merge "${target}"${flag}${message ? ` -m "${message}"` : ''}`;
    getConsole().logCommand(cmd);

    if (isTauri()) {
      try {
        await invoke('merge', { repoPath, target, strategy });
        getConsole().logSuccess(`Merged '${target}' into HEAD cleanly.`);
        return { success: true };
      } catch (err: any) {
        const error = formatGitError(err);
        const conflict = isConflictError(err);
        if (conflict) getConsole().logWarning(`Merge conflict detected while merging '${target}' into HEAD.`, error);
        else getConsole().logError(`Merge failed: ${error}`, undefined, cmd);
        return { success: false, conflict, error };
      }
    }

    const res = await fetch('/api/repo/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, target, strategy, message }),
    });
    const data = await parseOperationResult(res, 'Merge failed');
    if (data.conflict) {
      getConsole().logWarning(`Merge conflict detected while merging '${target}' into HEAD.`, data.error);
    } else if (data.success) {
      getConsole().logSuccess(`Merged '${target}' into HEAD cleanly.`, data.output);
    } else {
      getConsole().logError(`Merge failed: ${data.error}`, undefined, cmd);
    }
    return data;
  };

  const abortMerge = async (repoPath: string): Promise<void> => {
    const cmd = `git merge --abort`;
    getConsole().logCommand(cmd);
    if (isTauri()) {
      await invoke('merge_abort', { repoPath });
      getConsole().logInfo('Merge aborted. Working tree restored.');
      return;
    }
    const res = await fetch('/api/repo/merge/abort', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath }),
    });
    await parseGitResponse(res, 'Failed to abort merge');
    getConsole().logInfo('Merge aborted. Working tree restored.');
  };

  const continueMerge = async (repoPath: string): Promise<void> => {
    const cmd = 'git merge --continue';
    getConsole().logCommand(cmd);
    if (isTauri()) {
      await invoke('merge_continue', { repoPath });
    } else {
      const res = await fetch('/api/repo/merge/continue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_path: repoPath }),
      });
      if (!res.ok) throw new Error((await res.json()).error?.message || 'Merge continuation failed');
    }
    getConsole().logSuccess('Merge continued.');
  };

  const rebase = async (
    repoPath: string,
    upstream: string
  ): Promise<{ success: boolean; conflict?: boolean; error?: string }> => {
    const cmd = `git rebase "${upstream}"`;
    getConsole().logCommand(cmd);
    if (isTauri()) {
      try {
        await invoke('rebase', { repoPath, upstream });
        getConsole().logSuccess(`Rebase on '${upstream}' finished.`);
        return { success: true };
      } catch (err: any) {
        return { success: false, conflict: isConflictError(err), error: formatGitError(err) };
      }
    }
    const res = await fetch('/api/repo/rebase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, upstream }),
    });
    const data = await parseOperationResult(res, 'Rebase failed');
    if (data.conflict) {
      getConsole().logWarning(`Rebase conflicts encountered on '${upstream}'.`, data.error);
    } else if (data.success) {
      getConsole().logSuccess(`Rebase on '${upstream}' finished.`, data.output);
    } else {
      getConsole().logError(`Rebase error: ${data.error}`, undefined, cmd);
    }
    return data;
  };

  const continueRebase = async (repoPath: string): Promise<void> => {
    const cmd = `git rebase --continue`;
    getConsole().logCommand(cmd);
    if (isTauri()) {
      await invoke('rebase_continue', { repoPath });
    } else {
      const res = await fetch('/api/repo/rebase/continue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_path: repoPath }),
      });
      if (!res.ok) throw new Error((await res.json()).error?.message || 'Rebase continuation failed');
    }
    getConsole().logSuccess('Rebase continued.');
  };

  const abortRebase = async (repoPath: string): Promise<void> => {
    const cmd = `git rebase --abort`;
    getConsole().logCommand(cmd);
    if (isTauri()) {
      await invoke('operation_abort', { repoPath });
      getConsole().logInfo('Rebase aborted.');
      return;
    }
    const res = await fetch('/api/repo/rebase/abort', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath }),
    });
    await parseGitResponse(res, 'Failed to abort rebase');
    getConsole().logInfo('Rebase aborted.');
  };

  const cherryPick = async (
    repoPath: string,
    commitId: string
  ): Promise<{ success: boolean; conflict?: boolean; error?: string }> => {
    const cmd = `git cherry-pick "${commitId}"`;
    getConsole().logCommand(cmd);
    if (isTauri()) {
      try {
        await invoke('cherry_pick', { repoPath, commitId });
        getConsole().logSuccess(`Cherry-picked commit ${commitId.slice(0, 7)} cleanly.`);
        return { success: true };
      } catch (err: any) {
        return { success: false, conflict: isConflictError(err), error: formatGitError(err) };
      }
    }
    const res = await fetch('/api/repo/cherry-pick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, commit_id: commitId }),
    });
    const data = await parseOperationResult(res, 'Cherry-pick failed');
    if (data.conflict) {
      getConsole().logWarning(`Cherry-pick conflict on commit ${commitId.slice(0, 7)}.`, data.error);
    } else if (data.success) {
      getConsole().logSuccess(`Cherry-picked commit ${commitId.slice(0, 7)} cleanly.`, data.output);
    } else {
      getConsole().logError(`Cherry-pick failed: ${data.error}`, undefined, cmd);
    }
    return data;
  };

  const continueCherryPick = async (repoPath: string): Promise<void> => {
    const cmd = `git cherry-pick --continue`;
    getConsole().logCommand(cmd);
    if (isTauri()) {
      await invoke('cherry_pick_continue', { repoPath });
    } else {
      const res = await fetch('/api/repo/cherry-pick/continue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_path: repoPath }),
      });
      if (!res.ok) throw new Error((await res.json()).error?.message || 'Cherry-pick continuation failed');
    }
    getConsole().logSuccess('Cherry-pick continued.');
  };

  const abortCherryPick = async (repoPath: string): Promise<void> => {
    const cmd = `git cherry-pick --abort`;
    getConsole().logCommand(cmd);
    if (isTauri()) {
      await invoke('operation_abort', { repoPath });
      getConsole().logInfo('Cherry-pick aborted.');
      return;
    }
    const res = await fetch('/api/repo/cherry-pick/abort', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath }),
    });
    await parseGitResponse(res, 'Failed to abort cherry-pick');
    getConsole().logInfo('Cherry-pick aborted.');
  };

  const revertCommit = async (repoPath: string, commitId: string): Promise<{ success: boolean; output?: string }> => {
    const cmd = `git revert "${commitId}" --no-edit`;
    getConsole().logCommand(cmd);
    if (isTauri()) {
      try {
        await invoke('revert', { repoPath, commitId });
        getConsole().logSuccess(`Reverted commit ${commitId.slice(0, 7)}.`);
        return { success: true };
      } catch (err: any) {
        getConsole().logError(`Revert failed: ${err?.toString()}`, undefined, cmd);
        return { success: false };
      }
    }
    const res = await fetch('/api/repo/revert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, commit_id: commitId }),
    });
    const data = await res.json();
    if (data.success) {
      getConsole().logSuccess(`Reverted commit ${commitId.slice(0, 7)}.`, data.output);
    } else {
      getConsole().logError(`Revert failed: ${data.error}`, undefined, cmd);
    }
    return data;
  };

  const reset = async (repoPath: string, target: string, mode: '--soft' | '--mixed' | '--hard' = '--mixed'): Promise<void> => {
    const cmd = `git reset ${mode} "${target}"`;
    getConsole().logCommand(cmd);
    if (isTauri()) {
      await invoke('reset', { repoPath, target, mode });
      getConsole().logSuccess(`Branch reset ${mode} to ${target.slice(0, 7)}.`);
      return;
    }
    const res = await fetch('/api/repo/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, target, mode }),
    });
    const data = await res.json();
    if (data.success) {
      getConsole().logSuccess(`Branch reset ${mode} to ${target.slice(0, 7)}.`);
    } else {
      getConsole().logError(`Reset failed: ${data.error}`, undefined, cmd);
    }
  };

  const fetchRemote = async (repoPath: string): Promise<void> => {
    const cmd = `git fetch --all`;
    getConsole().logCommand(cmd);
    if (isTauri()) {
      await invoke('fetch_remote', { repoPath, remoteName: null });
      getConsole().logSuccess('Fetched remote references.');
      return;
    }
    const res = await fetch('/api/repo/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath }),
    });
    const data = await res.json();
    if (data.success) {
      getConsole().logSuccess(`Fetched all remote references.`, data.output);
    } else {
      getConsole().logError(`Fetch error: ${data.error}`, undefined, cmd);
    }
  };

  const createWorktree = async (repoPath: string, destination: string, branch: string): Promise<void> => {
    if (isTauri()) {
      await invoke('worktree_add', { repoPath, destination, branch });
      return;
    }
    const res = await fetch('/api/repo/worktree/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, dest_path: destination, branch }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error?.message || data.error || 'Failed to create worktree');
  };

  const pullRemote = async (repoPath: string, strategy: 'merge' | 'rebase' | 'ff-only' = 'merge'): Promise<void> => {
    const cmd = `git pull --${strategy === 'merge' ? 'no-rebase' : strategy}`;
    getConsole().logCommand(cmd);
    if (isTauri()) {
      await invoke('pull', { repoPath, strategy });
      getConsole().logSuccess('Pull completed.');
      return;
    }
    const res = await fetch('/api/repo/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, strategy }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      getConsole().logSuccess(`Pull completed: ${data.output || 'Already up to date.'}`);
    } else {
      const message = formatGitError(data.error, `Pull failed (HTTP ${res.status})`);
      getConsole().logError(`Pull error: ${message}`, undefined, cmd);
      throw new Error(message);
    }
  };

  const pushRemote = async (repoPath: string, forceWithLease = false): Promise<void> => {
    const cmd = `git push${forceWithLease ? ' --force-with-lease' : ''}`;
    getConsole().logCommand(cmd);
    if (isTauri()) {
      try {
        await invoke('push', { repoPath, forceWithLease });
        getConsole().logSuccess('Push completed.');
        return;
      } catch (error) {
        const message = formatGitError(error, 'Push failed');
        getConsole().logError(`Push error: ${message}`, undefined, cmd);
        throw new Error(message);
      }
    }
    const res = await fetch('/api/repo/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, force_with_lease: forceWithLease }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.success) {
      getConsole().logSuccess(`Push completed.`, data.output);
    } else {
      const message = formatGitError(data?.error ?? data, `Push failed (HTTP ${res.status})`);
      getConsole().logError(`Push error: ${message}`, undefined, cmd);
      throw new Error(message);
    }
  };

  const openSystemTerminal = async (repoPath: string): Promise<void> => {
    if (!isTauri()) {
      throw new Error('Opening a system terminal is only available in the desktop app.');
    }

    await invoke('open_system_terminal', { repoPath });
    getConsole().logInfo(`Opened a system terminal in ${repoPath}.`);
  };

  const openFileManager = async (repoPath: string): Promise<void> => {
    if (!isTauri()) {
      throw new Error('Opening a file manager is only available in the desktop app.');
    }
    await invoke('open_file_manager', { repoPath });
    getConsole().logInfo(`Opened the file manager in ${repoPath}.`);
  };

  const openInEditor = async (repoPath: string, editor: 'vscode' | 'idea'): Promise<void> => {
    if (!isTauri()) {
      throw new Error('Opening a code editor is only available in the desktop app.');
    }
    await invoke('open_in_editor', { repoPath, editor });
    getConsole().logInfo(`Opened ${repoPath} in ${editor === 'vscode' ? 'Visual Studio Code' : 'IntelliJ IDEA'}.`);
  };

  const getRepositorySshKey = async (repoPath: string): Promise<string | null> => {
    if (!isTauri()) return null;
    return invoke<string | null>('get_repository_ssh_key', { repoPath });
  };

  const setRepositorySshKey = async (repoPath: string, keyPath?: string): Promise<void> => {
    if (!isTauri()) {
      throw new Error('Repository SSH key management is only available in the desktop app.');
    }
    await invoke('set_repository_ssh_key', { repoPath, keyPath: keyPath?.trim() || null });
  };

  const saveSshPassphrase = async (keyPath: string, passphrase: string): Promise<string> => {
    if (!isTauri()) {
      throw new Error('SSH passphrase storage is only available in the desktop app.');
    }
    return invoke<string>('save_ssh_passphrase', { keyPath, passphrase });
  };

  const generateCommitMessage = async (
    diffText: string,
    config: LlmConfig,
    language: Locale
  ): Promise<GeneratedCommitMessage> => {
    getConsole().logInfo(`AI Copilot generating commit message using model: ${config.model}...`);
    let requestConfig = config;
    if (isTauri() && !config.api_key) {
      try {
        const apiKey = await invoke<string>('get_credential', { provider: config.provider, username: 'default' });
        requestConfig = { ...config, api_key: apiKey };
      } catch {
        // Keyless local/custom providers are valid.
      }
    }
    if (isTauri()) {
      return await invoke<GeneratedCommitMessage>('generate_commit_message', {
        diffText,
        config: requestConfig,
        language,
      });
    }
    const res = await fetch('/api/ai/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ diff_text: diffText, config, language }),
    });
    if (!res.ok) throw new Error((await res.text()) || 'AI commit generation failed');
    return await res.json();
  };

  const scanSecrets = async (diffText: string): Promise<SecretDetection[]> => {
    getConsole().logInfo(`AI Security scanner checking staged diff for sensitive tokens...`);
    if (isTauri()) {
      return await invoke<SecretDetection[]>('scan_secrets', { diffText });
    }
    const detections: SecretDetection[] = [];
    const rules: Array<[string, RegExp, SecretDetection['severity']]> = [
      ['AWS Access Key', /AKIA[0-9A-Z]{16}/i, 'Critical'],
      ['Private Key', /-----BEGIN (RSA|EC|OPENSSH|DSA|PRIVATE) KEY-----/, 'Critical'],
      ['GitHub Token', /(?:ghp_|github_pat_)[0-9A-Za-z_]+/, 'Critical'],
    ];
    diffText.split('\n').forEach((line, index) => {
      if (!line.startsWith('+') || line.startsWith('+++')) return;
      rules.forEach(([rule_name, pattern, severity]) => {
        const match = line.match(pattern);
        if (match) detections.push({ rule_name, line_number: index + 1, matched_snippet: match[0], severity });
      });
    });
    return detections;
  };

  const continueRevert = async (repoPath: string): Promise<string> => {
    const cmd = `git revert --continue`;
    getConsole().logCommand(cmd);
    if (isTauri()) {
      const commitId = await invoke<string>('revert_continue', { repoPath });
      getConsole().logSuccess(`Revert continued. Created commit ${commitId.slice(0, 7)}.`);
      return commitId;
    }
    const res = await fetch('/api/repo/revert/continue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath }),
    });
    const data = await parseGitResponse<{ success: boolean; commit_id: string }>(res, 'Failed to continue revert');
    getConsole().logSuccess(`Revert continued. Created commit ${data.commit_id.slice(0, 7)}.`);
    return data.commit_id;
  };

  const getCommitChanges = async (repoPath: string, commitId: string): Promise<FileStatusItem[]> => {
    if (isTauri()) {
      return await invoke<FileStatusItem[]>('get_commit_changes', { repoPath, commitId });
    }
    const res = await fetch(`/api/repo/commit-changes?path=${encodeURIComponent(repoPath)}&commit_id=${encodeURIComponent(commitId)}`);
    return await parseGitResponse<FileStatusItem[]>(res, 'Failed to fetch commit changes');
  };

  const listWorktrees = async (repoPath: string): Promise<WorktreeInfo[]> => {
    if (isTauri()) return await invoke<WorktreeInfo[]>('list_worktrees', { repoPath });
    const res = await fetch(`/api/repo/worktrees?path=${encodeURIComponent(repoPath)}`);
    return await parseGitResponse<WorktreeInfo[]>(res, 'Failed to load worktrees');
  };

  const worktreeOperation = async (repoPath: string, endpoint: 'remove' | 'lock' | 'prune', body: Record<string, unknown> = {}): Promise<void> => {
    if (isTauri()) {
      if (endpoint === 'remove') await invoke('remove_worktree', { repoPath, worktreePath: body.worktree_path, force: body.force || false });
      else if (endpoint === 'lock') await invoke('set_worktree_locked', { repoPath, worktreePath: body.worktree_path, locked: body.locked, reason: body.reason || null });
      else await invoke('prune_worktrees', { repoPath });
      return;
    }
    const res = await fetch(`/api/repo/worktree/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repo_path: repoPath, ...body }) });
    await parseGitResponse(res, `Failed to ${endpoint} worktree`);
  };

  const discoverGitRoots = async (repoPath: string): Promise<string[]> => {
    if (isTauri()) return await invoke<string[]>('discover_git_roots', { repoPath });
    const res = await fetch(`/api/repo/git-roots?path=${encodeURIComponent(repoPath)}`);
    return await parseGitResponse<string[]>(res, 'Failed to discover Git roots');
  };

  const openPullRequest = async (repoPath: string, base: string, compare: string): Promise<void> => {
    if (isTauri()) { await invoke('open_pull_request', { repoPath, base, compare }); return; }
    const params = new URLSearchParams({ path: repoPath, base, compare });
    const res = await fetch(`/api/repo/pull-request-url?${params.toString()}`);
    const url = await parseGitResponse<string>(res, 'Failed to create pull request URL');
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const listLocalHistory = async (repoPath: string, filePath: string): Promise<LocalHistoryEntry[]> => {
    if (isTauri()) return await invoke<LocalHistoryEntry[]>('list_local_history', { repoPath, filePath });
    const params = new URLSearchParams({ path: repoPath, file_path: filePath });
    const res = await fetch(`/api/repo/local-history?${params.toString()}`);
    return await parseGitResponse<LocalHistoryEntry[]>(res, 'Failed to load local history');
  };

  const createLocalHistorySnapshot = async (repoPath: string, filePath: string, label: string): Promise<LocalHistoryEntry> => {
    if (isTauri()) return await invoke<LocalHistoryEntry>('create_local_history_snapshot', { repoPath, filePath, label });
    const res = await fetch('/api/repo/local-history/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repo_path: repoPath, file_path: filePath, label }) });
    return await parseGitResponse<LocalHistoryEntry>(res, 'Failed to create local history snapshot');
  };

  const restoreLocalHistory = async (repoPath: string, filePath: string, snapshotId: string): Promise<void> => {
    if (isTauri()) { await invoke('restore_local_history', { repoPath, filePath, snapshotId }); return; }
    const res = await fetch('/api/repo/local-history/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repo_path: repoPath, file_path: filePath, snapshot_id: snapshotId }) });
    await parseGitResponse(res, 'Failed to restore local history');
  };

  const readLocalHistory = async (repoPath: string, filePath: string, snapshotId: string): Promise<string> => {
    if (isTauri()) return await invoke<string>('read_local_history', { repoPath, filePath, snapshotId });
    const params = new URLSearchParams({ path: repoPath, file_path: filePath, snapshot_id: snapshotId });
    const res = await fetch(`/api/repo/local-history/content?${params.toString()}`);
    return await parseGitResponse<string>(res, 'Failed to read local history');
  };

  const getSyncStatus = async (repoPath: string): Promise<SyncStatus> => {
    if (isTauri()) return await invoke<SyncStatus>('get_sync_status', { repoPath });
    const res = await fetch(`/api/repo/sync-status?path=${encodeURIComponent(repoPath)}`);
    return await parseGitResponse<SyncStatus>(res, 'Failed to load sync status');
  };

  const getInteractiveRebaseCommits = async (repoPath: string, upstream: string): Promise<RebaseCommit[]> => {
    if (isTauri()) return await invoke<RebaseCommit[]>('get_interactive_rebase_commits', { repoPath, upstream });
    const params = new URLSearchParams({ path: repoPath, upstream });
    const res = await fetch(`/api/repo/rebase/commits?${params.toString()}`);
    return await parseGitResponse<RebaseCommit[]>(res, 'Failed to load rebase commits');
  };

  const interactiveRebase = async (repoPath: string, upstream: string, plan: RebasePlanItem[]): Promise<void> => {
    getConsole().logCommand(`git rebase -i "${upstream}"`);
    if (isTauri()) {
      await invoke('interactive_rebase', { repoPath, upstream, plan });
      return;
    }
    const res = await fetch('/api/repo/rebase/interactive', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, upstream, plan }),
    });
    await parseGitResponse(res, 'Interactive rebase failed');
  };

  const resolveRevision = async (repoPath: string, revision: string): Promise<string> => {
    if (isTauri()) {
      return await invoke<string>('resolve_revision', { repoPath, revision });
    }
    const params = new URLSearchParams({ path: repoPath, revision });
    const res = await fetch(`/api/repo/resolve-revision?${params.toString()}`);
    return await parseGitResponse<string>(res, 'Revision was not found');
  };

  const getBranchChanges = async (
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

  const analyzeConflict = async (
    filePath: string,
    ours: string,
    theirs: string,
    base?: string,
    config?: LlmConfig,
    language: Locale = 'en'
  ): Promise<ConflictResolutionSuggestion> => {
    getConsole().logInfo(`AI analyzing merge conflict in ${filePath}...`);
    const finalConfig: LlmConfig = config || { provider: 'openai', api_base: 'https://api.openai.com/v1', model: 'gpt-4o' };
    let requestConfig: LlmConfig = finalConfig;
    if (isTauri() && !finalConfig.api_key) {
      try {
        const apiKey = await invoke<string>('get_credential', { provider: finalConfig.provider, username: 'default' });
        requestConfig = { ...finalConfig, api_key: apiKey };
      } catch {
        // Keyless provider
      }
    }
    if (isTauri()) {
      return await invoke<ConflictResolutionSuggestion>('analyze_conflict', {
        filePath,
        ours,
        theirs,
        base,
        config: requestConfig,
        language,
      });
    }
    const res = await fetch('/api/ai/conflict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_path: filePath, ours, theirs, base, config: requestConfig, language }),
    });
    if (!res.ok) throw new Error((await res.text()) || 'AI conflict analysis failed');
    return await res.json();
  };

  const getCredential = async (provider: string, username = 'default'): Promise<string> => {
    if (!isTauri()) throw new Error('Credential storage is only available in the desktop keyring');
    return await invoke<string>('get_credential', { provider, username });
  };

  const saveCredential = async (provider: string, token: string): Promise<void> => {
    if (!isTauri()) throw new Error('Credential storage is only available in the desktop keyring');
    await invoke('save_credential', { provider, username: 'default', token });
  };

  return {
    isTauri,
    validateRepo,
    initRepo,
    cloneRepo,
    getRepoInfo,
    getRepoStatus,
    listBranches,
    listRemotes,
    setRemoteUrl,
    createBranch,
    checkoutBranch,
    renameBranch,
    deleteBranch,
    getCommitGraph,
    listTags,
    createTag,
    listStashes,
    createStash,
    popStash,
    applyStash: (repoPath: string, index: number) => stashOperation(repoPath, 'apply', index),
    dropStash: (repoPath: string, index: number) => stashOperation(repoPath, 'drop', index),
    renameStash: (repoPath: string, index: number, message: string) => stashOperation(repoPath, 'rename', index, message),
    getStashChanges,
    createShelf,
    stageFile,
    stageAll,
    unstageFile,
    unstageAll,
    discardFile,
    createCommit,
    getCommitTemplate,
    commitAndPush,
    getFileDiff,
    applyPartialPatch,
    getFileHistory,
    getFileBlame,
    getConflictFile,
    resolveConflict,
    mergeBranch,
    abortMerge,
    continueMerge,
    rebase,
    getInteractiveRebaseCommits,
    interactiveRebase,
    continueRebase,
    abortRebase,
    cherryPick,
    continueCherryPick,
    abortCherryPick,
    revertCommit,
    continueRevert,
    getCommitChanges,
    resolveRevision,
    getBranchChanges,
    reset,
    fetchRemote,
    createWorktree,
    listWorktrees,
    removeWorktree: (repoPath: string, worktreePath: string, force = false) => worktreeOperation(repoPath, 'remove', { worktree_path: worktreePath, force }),
    setWorktreeLocked: (repoPath: string, worktreePath: string, locked: boolean, reason?: string) => worktreeOperation(repoPath, 'lock', { worktree_path: worktreePath, locked, reason }),
    pruneWorktrees: (repoPath: string) => worktreeOperation(repoPath, 'prune'),
    discoverGitRoots,
    openPullRequest,
    listLocalHistory,
    createLocalHistorySnapshot,
    restoreLocalHistory,
    readLocalHistory,
    pullRemote,
    pushRemote,
    getSyncStatus,
    openSystemTerminal,
    openFileManager,
    openInEditor,
    getRepositorySshKey,
    setRepositorySshKey,
    saveSshPassphrase,
    generateCommitMessage,
    scanSecrets,
    analyzeConflict,
    getCredential,
    saveCredential,
  };
}
