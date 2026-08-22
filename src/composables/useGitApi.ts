import { invoke } from '@tauri-apps/api/core';
import type {
  RepositoryInfo,
  RepoStatusSummary,
  BranchItem,
  TagItem,
  StashItem,
} from '@/types/git';
import type { GraphCommitNode } from '@/types/graph';
import type {
  LlmConfig,
  GeneratedCommitMessage,
  SecretDetection,
} from '@/types/ai';
import { useConsoleStore } from '@/stores/console';

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

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
    getConsole().logCommand(`git clone "${url}" "${destination}"`);
    const res = await fetch('/api/repo/clone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, destination }),
    });
    const data = await res.json();
    if (data.success) {
      getConsole().logSuccess(`Cloned ${url} into ${destination}`);
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
    return await res.json();
  };

  const getRepoStatus = async (repoPath: string): Promise<RepoStatusSummary> => {
    if (isTauri()) {
      return await invoke<RepoStatusSummary>('get_repo_status', { repoPath });
    }
    const res = await fetch(`/api/repo/status?path=${encodeURIComponent(repoPath)}`);
    return await res.json();
  };

  const listBranches = async (repoPath: string): Promise<BranchItem[]> => {
    if (isTauri()) {
      return await invoke<BranchItem[]>('list_branches', { repoPath });
    }
    const res = await fetch(`/api/repo/branches?path=${encodeURIComponent(repoPath)}`);
    return await res.json();
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

  const deleteBranch = async (repoPath: string, name: string, force = false): Promise<void> => {
    const cmd = `git branch ${force ? '-D' : '-d'} "${name}"`;
    getConsole().logCommand(cmd);
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
    return await res.json();
  };

  const listTags = async (repoPath: string): Promise<TagItem[]> => {
    if (isTauri()) {
      return await invoke<TagItem[]>('list_tags', { repoPath });
    }
    const res = await fetch(`/api/repo/tags?path=${encodeURIComponent(repoPath)}`);
    return await res.json();
  };

  const createTag = async (
    repoPath: string,
    name: string,
    message?: string,
    commitId?: string
  ): Promise<void> => {
    const cmd = `git tag "${name}"${message ? ` -m "${message}"` : ''}${commitId ? ` "${commitId}"` : ''}`;
    getConsole().logCommand(cmd);
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
    return await res.json();
  };

  const createStash = async (repoPath: string, message?: string): Promise<void> => {
    const cmd = `git stash${message ? ` push -m "${message}"` : ''}`;
    getConsole().logCommand(cmd);
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

  const getFileDiff = async (
    repoPath: string,
    filePath: string,
    staged = false,
    commitId?: string
  ): Promise<{ raw_diff: string }> => {
    const params = new URLSearchParams({
      path: repoPath,
      file: filePath,
      staged: String(staged),
    });
    if (commitId) params.append('commit', commitId);
    const res = await fetch(`/api/repo/diff?${params.toString()}`);
    return await res.json();
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

    const res = await fetch('/api/repo/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, target, strategy, message }),
    });
    const data = await res.json();
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
    await fetch('/api/repo/merge/abort', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath }),
    });
    getConsole().logInfo('Merge aborted. Working tree restored.');
  };

  const rebase = async (
    repoPath: string,
    upstream: string
  ): Promise<{ success: boolean; conflict?: boolean; error?: string }> => {
    const cmd = `git rebase "${upstream}"`;
    getConsole().logCommand(cmd);
    const res = await fetch('/api/repo/rebase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, upstream }),
    });
    const data = await res.json();
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
    await fetch('/api/repo/rebase/continue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath }),
    });
    getConsole().logSuccess('Rebase continued.');
  };

  const abortRebase = async (repoPath: string): Promise<void> => {
    const cmd = `git rebase --abort`;
    getConsole().logCommand(cmd);
    await fetch('/api/repo/rebase/abort', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath }),
    });
    getConsole().logInfo('Rebase aborted.');
  };

  const cherryPick = async (
    repoPath: string,
    commitId: string
  ): Promise<{ success: boolean; conflict?: boolean; error?: string }> => {
    const cmd = `git cherry-pick "${commitId}"`;
    getConsole().logCommand(cmd);
    const res = await fetch('/api/repo/cherry-pick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, commit_id: commitId }),
    });
    const data = await res.json();
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
    await fetch('/api/repo/cherry-pick/continue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath }),
    });
    getConsole().logSuccess('Cherry-pick continued.');
  };

  const abortCherryPick = async (repoPath: string): Promise<void> => {
    const cmd = `git cherry-pick --abort`;
    getConsole().logCommand(cmd);
    await fetch('/api/repo/cherry-pick/abort', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath }),
    });
    getConsole().logInfo('Cherry-pick aborted.');
  };

  const revertCommit = async (repoPath: string, commitId: string): Promise<{ success: boolean; output?: string }> => {
    const cmd = `git revert "${commitId}" --no-edit`;
    getConsole().logCommand(cmd);
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

  const pullRemote = async (repoPath: string): Promise<void> => {
    const cmd = `git pull`;
    getConsole().logCommand(cmd);
    const res = await fetch('/api/repo/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath }),
    });
    const data = await res.json();
    if (data.success) {
      getConsole().logSuccess(`Pull completed: ${data.output || 'Already up to date.'}`);
    } else {
      getConsole().logError(`Pull error: ${data.error}`, undefined, cmd);
    }
  };

  const pushRemote = async (repoPath: string): Promise<void> => {
    const cmd = `git push`;
    getConsole().logCommand(cmd);
    const res = await fetch('/api/repo/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath }),
    });
    const data = await res.json();
    if (data.success) {
      getConsole().logSuccess(`Push completed.`, data.output);
    } else {
      getConsole().logError(`Push error: ${data.error}`, undefined, cmd);
    }
  };

  const generateCommitMessage = async (
    diffText: string,
    config: LlmConfig
  ): Promise<GeneratedCommitMessage> => {
    getConsole().logInfo(`AI Copilot generating commit message using model: ${config.model}...`);
    if (isTauri()) {
      return await invoke<GeneratedCommitMessage>('generate_commit_message', {
        diffText,
        config,
      });
    }
    return {
      commit_type: 'feat',
      summary: 'feat(core): update repository workflow',
      raw_full_message: 'feat(core): update repository workflow',
    };
  };

  const scanSecrets = async (diffText: string): Promise<SecretDetection[]> => {
    getConsole().logInfo(`AI Security scanner checking staged diff for sensitive tokens...`);
    if (isTauri()) {
      return await invoke<SecretDetection[]>('scan_secrets', { diffText });
    }
    return [];
  };

  return {
    isTauri,
    validateRepo,
    initRepo,
    cloneRepo,
    getRepoInfo,
    getRepoStatus,
    listBranches,
    createBranch,
    checkoutBranch,
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
    getFileDiff,
    mergeBranch,
    abortMerge,
    rebase,
    continueRebase,
    abortRebase,
    cherryPick,
    continueCherryPick,
    abortCherryPick,
    revertCommit,
    reset,
    fetchRemote,
    pullRemote,
    pushRemote,
    generateCommitMessage,
    scanSecrets,
  };
}
