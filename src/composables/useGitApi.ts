import { invoke } from '@tauri-apps/api/core';
import type {
  RepositoryInfo,
  RepoStatusSummary,
  FileStatusItem,
  BranchItem,
  RemoteItem,
  TagItem,
  StashItem,
} from '@/types/git';
import type { GraphCommitNode } from '@/types/graph';
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
    maxCount: number = 100
  ): Promise<GraphCommitNode[]> => {
    if (isTauri()) {
      return await invoke<GraphCommitNode[]>('get_commit_graph', {
        repoPath,
        maxCount,
      });
    }
    const res = await fetch(`/api/repo/graph?path=${encodeURIComponent(repoPath)}&max=${maxCount}`);
    return await parseGitResponse<GraphCommitNode[]>(res, 'Failed to load commit graph');
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
    email: string
  ): Promise<string> => {
    const cmd = `git commit -m "${message}" --author="${author} <${email}>"`;
    getConsole().logCommand(cmd);

    if (isTauri()) {
      const cid = await invoke<string>('create_commit', {
        repoPath,
        message,
        author,
        email,
      });
      getConsole().logSuccess(`Commit ${cid.slice(0, 7)} created: ${message}`);
      return cid;
    }
    const res = await fetch('/api/repo/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, message, author, email }),
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
    commitId?: string
  ): Promise<any> => {
    const params = new URLSearchParams({
      path: repoPath,
      file: filePath,
      staged: String(staged),
    });
    if (commitId) params.append('commit', commitId);
    if (isTauri()) {
      return await invoke('get_file_diff', {
        repoPath,
        filePath,
        staged,
        commitId: commitId || null,
      });
    }
    const res = await fetch(`/api/repo/diff?${params.toString()}`);
    return await res.json();
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

  const pullRemote = async (repoPath: string): Promise<void> => {
    const cmd = `git pull`;
    getConsole().logCommand(cmd);
    if (isTauri()) {
      await invoke('pull', { repoPath });
      getConsole().logSuccess('Pull completed.');
      return;
    }
    const res = await fetch('/api/repo/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath }),
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

  const pushRemote = async (repoPath: string): Promise<void> => {
    const cmd = `git push`;
    getConsole().logCommand(cmd);
    if (isTauri()) {
      try {
        await invoke('push', { repoPath });
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
      body: JSON.stringify({ repo_path: repoPath }),
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
    stageFile,
    stageAll,
    unstageFile,
    unstageAll,
    discardFile,
    createCommit,
    commitAndPush,
    getFileDiff,
    getConflictFile,
    resolveConflict,
    mergeBranch,
    abortMerge,
    continueMerge,
    rebase,
    continueRebase,
    abortRebase,
    cherryPick,
    continueCherryPick,
    abortCherryPick,
    revertCommit,
    continueRevert,
    getCommitChanges,
    reset,
    fetchRemote,
    createWorktree,
    pullRemote,
    pushRemote,
    openSystemTerminal,
    openFileManager,
    generateCommitMessage,
    scanSecrets,
    analyzeConflict,
    getCredential,
    saveCredential,
  };
}
