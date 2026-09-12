import { invoke } from '@tauri-apps/api/core';
import type {
  RepositoryInfo,
  RepoStatusSummary,
  BranchItem,
  RemoteItem,
  TagItem,
  StashItem,
  FileStatusItem,
  RebaseCommit,
  RebasePlanItem,
  SyncStatus,
  BranchCheckoutResult,
} from '@/types/git';
import {
  isTauri,
  formatGitError,
  parseGitResponse,
  parseOperationResult,
  isConflictError,
  redactRemoteUrl,
  getConsole,
  gitbxFetch,
} from '@/api/common';

export const validateRepo = async (repoPath: string): Promise<{ valid: boolean; path?: string; name?: string; message?: string }> => {
  getConsole().logCommand(`git rev-parse --show-toplevel (in ${repoPath})`);
  if (isTauri()) {
    try {
      const info = await invoke<RepositoryInfo>('get_repo_info', { repoPath });
      return { valid: true, path: info.path, name: info.name };
    } catch (err: any) {
      return { valid: false, message: err.toString() };
    }
  }
  const res = await gitbxFetch('/api/repo/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: repoPath }),
  });
  return await res.json();
};

export const initRepo = async (repoPath: string): Promise<{ success: boolean; path: string; name: string }> => {
  getConsole().logCommand(`git init "${repoPath}"`);
  if (isTauri()) {
    const info = await invoke<RepositoryInfo>('init_repo', { repoPath });
    getConsole().logSuccess(`Initialized Git repository in ${repoPath}`);
    return { success: true, path: info.path, name: info.name };
  }
  const res = await gitbxFetch('/api/repo/init', {
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

export const cloneRepo = async (url: string, destination: string): Promise<{ success: boolean; path: string; name: string }> => {
  getConsole().logCommand(`git clone "${redactRemoteUrl(url)}" "${destination}"`);
  if (isTauri()) {
    const info = await invoke<RepositoryInfo>('clone_repo', { url, destination });
    getConsole().logSuccess(`Cloned ${redactRemoteUrl(url)} into ${destination}`);
    return { success: true, path: info.path, name: info.name };
  }
  const res = await gitbxFetch('/api/repo/clone', {
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

export const getRepoInfo = async (repoPath: string): Promise<RepositoryInfo> => {
  if (isTauri()) {
    return await invoke<RepositoryInfo>('get_repo_info', { repoPath });
  }
  const res = await gitbxFetch(`/api/repo/info?path=${encodeURIComponent(repoPath)}`);
  return await parseGitResponse<RepositoryInfo>(res, 'Failed to load repository information');
};

export const getRepoStatus = async (repoPath: string): Promise<RepoStatusSummary> => {
  if (isTauri()) {
    return await invoke<RepoStatusSummary>('get_repo_status', { repoPath });
  }
  const res = await gitbxFetch(`/api/repo/status?path=${encodeURIComponent(repoPath)}`);
  return await parseGitResponse<RepoStatusSummary>(res, 'Failed to load repository status');
};

export const listBranches = async (repoPath: string): Promise<BranchItem[]> => {
  if (isTauri()) {
    return await invoke<BranchItem[]>('list_branches', { repoPath });
  }
  const res = await gitbxFetch(`/api/repo/branches?path=${encodeURIComponent(repoPath)}`);
  return await parseGitResponse<BranchItem[]>(res, 'Failed to load branches');
};

export const listRemotes = async (repoPath: string): Promise<RemoteItem[]> => {
  if (isTauri()) {
    return await invoke<RemoteItem[]>('list_remotes', { repoPath });
  }
  const res = await gitbxFetch(`/api/repo/remotes?path=${encodeURIComponent(repoPath)}`);
  return await parseGitResponse<RemoteItem[]>(res, 'Failed to load remotes');
};

export const setRemoteUrl = async (
  repoPath: string,
  remoteName: string,
  url: string,
  pushUrl?: string,
): Promise<void> => {
  const fetchUrl = url.trim();
  const separatePushUrl = pushUrl?.trim() || undefined;
  const cmd = `git remote set-url "${remoteName}" "${redactRemoteUrl(fetchUrl)}"`;
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

  const res = await gitbxFetch('/api/repo/remote/set-url', {
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

export const createBranch = async (
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
  const res = await gitbxFetch('/api/repo/branch/create', {
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

export const checkoutBranch = async (repoPath: string, name: string, smart = false): Promise<BranchCheckoutResult> => {
  const cmd = smart ? `git checkout "${name}" (Smart Checkout)` : `git checkout "${name}"`;
  getConsole().logCommand(cmd);

  if (isTauri()) {
    const result = smart
      ? await invoke<BranchCheckoutResult>('smart_checkout_branch', { repoPath, branchName: name })
      : (await invoke('checkout_branch', { repoPath, branchName: name }), { conflicts: false, stash_kept: false });
    getConsole().logSuccess(`Switched to branch '${name}'.`);
    return result;
  }
  const res = await gitbxFetch('/api/repo/branch/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_path: repoPath, name, smart }),
  });
  const data = await res.json();
  if (data.error) {
    getConsole().logError(data.error, undefined, cmd);
    throw new Error(data.error);
  }
  getConsole().logSuccess(`Switched to branch '${name}'.`);
  return data.value || { conflicts: false, stash_kept: false };
};

export const renameBranch = async (repoPath: string, oldName: string, newName: string): Promise<void> => {
  const cmd = `git branch -m "${oldName}" "${newName}"`;
  getConsole().logCommand(cmd);
  if (isTauri()) {
    await invoke('rename_branch', { repoPath, oldName, newName });
    getConsole().logSuccess(`Renamed branch '${oldName}' to '${newName}'.`);
    return;
  }
  const res = await gitbxFetch('/api/repo/branch/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_path: repoPath, old_name: oldName, new_name: newName }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  getConsole().logSuccess(`Renamed branch '${oldName}' to '${newName}'.`);
};

export const deleteBranch = async (repoPath: string, name: string, force = false): Promise<void> => {
  const cmd = `git branch ${force ? '-D' : '-d'} "${name}"`;
  getConsole().logCommand(cmd);
  if (isTauri()) {
    await invoke('delete_branch', { repoPath, name, force });
    getConsole().logSuccess(`Deleted branch '${name}'.`);
    return;
  }
  const res = await gitbxFetch('/api/repo/branch/delete', {
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

export const listTags = async (repoPath: string): Promise<TagItem[]> => {
  if (isTauri()) {
    return await invoke<TagItem[]>('list_tags', { repoPath });
  }
  const res = await gitbxFetch(`/api/repo/tags?path=${encodeURIComponent(repoPath)}`);
  return await parseGitResponse<TagItem[]>(res, 'Failed to load tags');
};

export const createTag = async (
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
  const res = await gitbxFetch('/api/repo/tag/create', {
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

export const listStashes = async (repoPath: string): Promise<StashItem[]> => {
  if (isTauri()) {
    return await invoke<StashItem[]>('list_stashes', { repoPath });
  }
  const res = await gitbxFetch(`/api/repo/stashes?path=${encodeURIComponent(repoPath)}`);
  return await parseGitResponse<StashItem[]>(res, 'Failed to load stashes');
};

export const createStash = async (repoPath: string, message?: string): Promise<void> => {
  const cmd = `git stash${message ? ` push -m "${message}"` : ''}`;
  getConsole().logCommand(cmd);
  if (isTauri()) {
    await invoke('create_stash', { repoPath, message });
    getConsole().logSuccess('Saved working directory and index state to stash.');
    return;
  }
  const res = await gitbxFetch('/api/repo/stash/create', {
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

export const popStash = async (repoPath: string, index = 0): Promise<void> => {
  const cmd = `git stash pop stash@{${index}}`;
  getConsole().logCommand(cmd);
  if (isTauri()) {
    await invoke('pop_stash', { repoPath, index });
    getConsole().logSuccess(`Applied stash@{${index}}.`);
    return;
  }
  const res = await gitbxFetch('/api/repo/stash/pop', {
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

export const stageFile = async (repoPath: string, filePath: string): Promise<void> => {
  const cmd = `git add "${filePath}"`;
  getConsole().logCommand(cmd);
  if (isTauri()) {
    await invoke('stage_file', { repoPath, filePath });
    return;
  }
  await gitbxFetch('/api/repo/stage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_path: repoPath, file_path: filePath }),
  });
};

export const stageAll = async (repoPath: string): Promise<void> => {
  const cmd = `git add -A`;
  getConsole().logCommand(cmd);
  if (isTauri()) {
    await invoke('stage_all', { repoPath });
    return;
  }
  await gitbxFetch('/api/repo/stage-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_path: repoPath }),
  });
  getConsole().logSuccess('All changes staged.');
};

export const unstageFile = async (repoPath: string, filePath: string): Promise<void> => {
  const cmd = `git restore --staged "${filePath}"`;
  getConsole().logCommand(cmd);
  if (isTauri()) {
    await invoke('unstage_file', { repoPath, filePath });
    return;
  }
  await gitbxFetch('/api/repo/unstage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_path: repoPath, file_path: filePath }),
  });
};

export const unstageAll = async (repoPath: string): Promise<void> => {
  const cmd = `git restore --staged .`;
  getConsole().logCommand(cmd);
  if (isTauri()) {
    await invoke('unstage_all', { repoPath });
    getConsole().logSuccess('All changes unstaged.');
    return;
  }
  await gitbxFetch('/api/repo/unstage-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_path: repoPath }),
  });
  getConsole().logSuccess('All changes unstaged.');
};

export const discardFile = async (repoPath: string, filePath?: string): Promise<void> => {
  const cmd = filePath ? `git restore "${filePath}"` : `git restore . && git clean -fd`;
  getConsole().logCommand(cmd);
  if (isTauri()) {
    await invoke('discard_file', { repoPath, filePath: filePath || null });
    getConsole().logWarning(`Discarded changes: ${filePath || 'All files'}`);
    return;
  }
  await gitbxFetch('/api/repo/discard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_path: repoPath, file_path: filePath }),
  });
  getConsole().logWarning(`Discarded changes: ${filePath || 'All files'}`);
};

export const createCommit = async (
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
  const res = await gitbxFetch('/api/repo/commit', {
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

export const commitAndPush = async (
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
  const res = await gitbxFetch('/api/repo/commit-and-push', {
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

export const getCommitTemplate = async (repoPath: string): Promise<string | null> => {
  if (isTauri()) return await invoke<string | null>('get_commit_template', { repoPath });
  const res = await gitbxFetch(`/api/repo/commit-template?path=${encodeURIComponent(repoPath)}`);
  return await parseGitResponse<string | null>(res, 'Failed to load commit template');
};

export const stashOperation = async (repoPath: string, operation: 'apply' | 'drop' | 'rename', index: number, message?: string): Promise<void> => {
  const cmd = `git stash ${operation} stash@{${index}}`;
  getConsole().logCommand(cmd);
  if (isTauri()) {
    if (operation === 'rename') await invoke('rename_stash', { repoPath, index, message: message || '' });
    else await invoke(`${operation}_stash`, { repoPath, index });
    return;
  }
  const res = await gitbxFetch(`/api/repo/stash/${operation}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_path: repoPath, index, message }),
  });
  await parseGitResponse(res, `Failed to ${operation} stash`);
};

export const getStashChanges = async (repoPath: string, commitId: string): Promise<FileStatusItem[]> => {
  if (isTauri()) return await invoke<FileStatusItem[]>('get_stash_changes', { repoPath, commitId });
  const params = new URLSearchParams({ path: repoPath, commit_id: commitId });
  const res = await gitbxFetch(`/api/repo/stash/changes?${params.toString()}`);
  return await parseGitResponse<FileStatusItem[]>(res, 'Failed to load stash changes');
};

export const mergeBranch = async (
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

  const res = await gitbxFetch('/api/repo/merge', {
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

export const abortMerge = async (repoPath: string): Promise<void> => {
  const cmd = `git merge --abort`;
  getConsole().logCommand(cmd);
  if (isTauri()) {
    await invoke('merge_abort', { repoPath });
    getConsole().logInfo('Merge aborted. Working tree restored.');
    return;
  }
  const res = await gitbxFetch('/api/repo/merge/abort', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_path: repoPath }),
  });
  await parseGitResponse(res, 'Failed to abort merge');
  getConsole().logInfo('Merge aborted. Working tree restored.');
};

export const continueMerge = async (repoPath: string): Promise<void> => {
  const cmd = 'git merge --continue';
  getConsole().logCommand(cmd);
  if (isTauri()) {
    await invoke('merge_continue', { repoPath });
  } else {
    const res = await gitbxFetch('/api/repo/merge/continue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath }),
    });
    if (!res.ok) throw new Error((await res.json()).error?.message || 'Merge continuation failed');
  }
  getConsole().logSuccess('Merge continued.');
};

export const rebase = async (
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
  const res = await gitbxFetch('/api/repo/rebase', {
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

export const continueRebase = async (repoPath: string): Promise<void> => {
  const cmd = `git rebase --continue`;
  getConsole().logCommand(cmd);
  if (isTauri()) {
    await invoke('rebase_continue', { repoPath });
  } else {
    const res = await gitbxFetch('/api/repo/rebase/continue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath }),
    });
    if (!res.ok) throw new Error((await res.json()).error?.message || 'Rebase continuation failed');
  }
  getConsole().logSuccess('Rebase continued.');
};

export const abortRebase = async (repoPath: string): Promise<void> => {
  const cmd = `git rebase --abort`;
  getConsole().logCommand(cmd);
  if (isTauri()) {
    await invoke('operation_abort', { repoPath });
    getConsole().logInfo('Rebase aborted.');
    return;
  }
  const res = await gitbxFetch('/api/repo/rebase/abort', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_path: repoPath }),
  });
  await parseGitResponse(res, 'Failed to abort rebase');
  getConsole().logInfo('Rebase aborted.');
};

export const cherryPick = async (
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
  const res = await gitbxFetch('/api/repo/cherry-pick', {
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

export const continueCherryPick = async (repoPath: string): Promise<void> => {
  const cmd = `git cherry-pick --continue`;
  getConsole().logCommand(cmd);
  if (isTauri()) {
    await invoke('cherry_pick_continue', { repoPath });
  } else {
    const res = await gitbxFetch('/api/repo/cherry-pick/continue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath }),
    });
    if (!res.ok) throw new Error((await res.json()).error?.message || 'Cherry-pick continuation failed');
  }
  getConsole().logSuccess('Cherry-pick continued.');
};

export const abortCherryPick = async (repoPath: string): Promise<void> => {
  const cmd = `git cherry-pick --abort`;
  getConsole().logCommand(cmd);
  if (isTauri()) {
    await invoke('operation_abort', { repoPath });
    getConsole().logInfo('Cherry-pick aborted.');
    return;
  }
  const res = await gitbxFetch('/api/repo/cherry-pick/abort', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_path: repoPath }),
  });
  await parseGitResponse(res, 'Failed to abort cherry-pick');
  getConsole().logInfo('Cherry-pick aborted.');
};

export const revertCommit = async (repoPath: string, commitId: string): Promise<{ success: boolean; output?: string }> => {
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
  const res = await gitbxFetch('/api/repo/revert', {
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

export const reset = async (repoPath: string, target: string, mode: '--soft' | '--mixed' | '--hard' = '--mixed'): Promise<void> => {
  const cmd = `git reset ${mode} "${target}"`;
  getConsole().logCommand(cmd);
  if (isTauri()) {
    await invoke('reset', { repoPath, target, mode });
    getConsole().logSuccess(`Branch reset ${mode} to ${target.slice(0, 7)}.`);
    return;
  }
  const res = await gitbxFetch('/api/repo/reset', {
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

export const fetchRemote = async (repoPath: string): Promise<void> => {
  const cmd = `git fetch --all`;
  getConsole().logCommand(cmd);
  if (isTauri()) {
    await invoke('fetch_remote', { repoPath, remoteName: null });
    getConsole().logSuccess('Fetched remote references.');
    return;
  }
  const res = await gitbxFetch('/api/repo/fetch', {
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

export const pullRemote = async (repoPath: string, strategy: 'merge' | 'rebase' | 'ff-only' = 'merge'): Promise<void> => {
  const cmd = `git pull --${strategy === 'merge' ? 'no-rebase' : strategy}`;
  getConsole().logCommand(cmd);
  if (isTauri()) {
    await invoke('pull', { repoPath, strategy });
    getConsole().logSuccess('Pull completed.');
    return;
  }
  const res = await gitbxFetch('/api/repo/pull', {
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

export const pushRemote = async (repoPath: string, forceWithLease = false): Promise<void> => {
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
  const res = await gitbxFetch('/api/repo/push', {
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

export const continueRevert = async (repoPath: string): Promise<string> => {
  const cmd = `git revert --continue`;
  getConsole().logCommand(cmd);
  if (isTauri()) {
    const commitId = await invoke<string>('revert_continue', { repoPath });
    getConsole().logSuccess(`Revert continued. Created commit ${commitId.slice(0, 7)}.`);
    return commitId;
  }
  const res = await gitbxFetch('/api/repo/revert/continue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_path: repoPath }),
  });
  const data = await parseGitResponse<{ success: boolean; commit_id: string }>(res, 'Failed to continue revert');
  getConsole().logSuccess(`Revert continued. Created commit ${data.commit_id.slice(0, 7)}.`);
  return data.commit_id;
};

export const abortRevert = async (repoPath: string): Promise<void> => {
  getConsole().logCommand('git revert --abort');
  if (isTauri()) {
    await invoke('abort_revert', { repoPath });
    getConsole().logInfo('Revert aborted. Working tree restored.');
    return;
  }
  const res = await gitbxFetch('/api/repo/revert/abort', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_path: repoPath }),
  });
  await parseGitResponse(res, 'Failed to abort revert');
  getConsole().logInfo('Revert aborted. Working tree restored.');
};

export const getSyncStatus = async (repoPath: string): Promise<SyncStatus> => {
  if (isTauri()) return await invoke<SyncStatus>('get_sync_status', { repoPath });
  const res = await gitbxFetch(`/api/repo/sync-status?path=${encodeURIComponent(repoPath)}`);
  return await parseGitResponse<SyncStatus>(res, 'Failed to load sync status');
};

export const getInteractiveRebaseCommits = async (repoPath: string, upstream: string): Promise<RebaseCommit[]> => {
  if (isTauri()) return await invoke<RebaseCommit[]>('get_interactive_rebase_commits', { repoPath, upstream });
  const params = new URLSearchParams({ path: repoPath, upstream });
  const res = await gitbxFetch(`/api/repo/rebase/commits?${params.toString()}`);
  return await parseGitResponse<RebaseCommit[]>(res, 'Failed to load rebase commits');
};

export const interactiveRebase = async (repoPath: string, upstream: string, plan: RebasePlanItem[]): Promise<void> => {
  getConsole().logCommand(`git rebase -i "${upstream}"`);
  if (isTauri()) {
    await invoke('interactive_rebase', { repoPath, upstream, plan });
    return;
  }
  const res = await gitbxFetch('/api/repo/rebase/interactive', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_path: repoPath, upstream, plan }),
  });
  await parseGitResponse(res, 'Interactive rebase failed');
};

export const applyStash = (repoPath: string, index: number): Promise<void> =>
  stashOperation(repoPath, 'apply', index);

export const dropStash = (repoPath: string, index: number): Promise<void> =>
  stashOperation(repoPath, 'drop', index);

export const renameStash = (repoPath: string, index: number, message: string): Promise<void> =>
  stashOperation(repoPath, 'rename', index, message);
