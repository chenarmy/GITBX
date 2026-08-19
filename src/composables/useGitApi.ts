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

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function useGitApi() {
  const validateRepo = async (repoPath: string): Promise<{ valid: boolean; path?: string; name?: string; message?: string }> => {
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
    const res = await fetch('/api/repo/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: repoPath }),
    });
    return await res.json();
  };

  const cloneRepo = async (url: string, destination: string): Promise<{ success: boolean; path: string; name: string }> => {
    const res = await fetch('/api/repo/clone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, destination }),
    });
    return await res.json();
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
    if (isTauri()) {
      return await invoke('create_branch', { repoPath, name, targetCommitId: startPoint });
    }
    await fetch('/api/repo/branch/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, name, start_point: startPoint, checkout }),
    });
  };

  const checkoutBranch = async (repoPath: string, name: string): Promise<void> => {
    if (isTauri()) {
      return await invoke('checkout_branch', { repoPath, branchName: name });
    }
    await fetch('/api/repo/branch/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, name }),
    });
  };

  const deleteBranch = async (repoPath: string, name: string, force = false): Promise<void> => {
    await fetch('/api/repo/branch/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, name, force }),
    });
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
    await fetch('/api/repo/tag/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, name, message, commit_id: commitId }),
    });
  };

  const listStashes = async (repoPath: string): Promise<StashItem[]> => {
    if (isTauri()) {
      return await invoke<StashItem[]>('list_stashes', { repoPath });
    }
    const res = await fetch(`/api/repo/stashes?path=${encodeURIComponent(repoPath)}`);
    return await res.json();
  };

  const createStash = async (repoPath: string, message?: string): Promise<void> => {
    await fetch('/api/repo/stash/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, message }),
    });
  };

  const popStash = async (repoPath: string, index = 0): Promise<void> => {
    await fetch('/api/repo/stash/pop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, index }),
    });
  };

  const stageFile = async (repoPath: string, filePath: string): Promise<void> => {
    if (isTauri()) {
      return await invoke('stage_file', { repoPath, filePath });
    }
    await fetch('/api/repo/stage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, file_path: filePath }),
    });
  };

  const stageAll = async (repoPath: string): Promise<void> => {
    if (isTauri()) {
      return await invoke('stage_all', { repoPath });
    }
    await fetch('/api/repo/stage-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath }),
    });
  };

  const unstageFile = async (repoPath: string, filePath: string): Promise<void> => {
    if (isTauri()) {
      return await invoke('unstage_file', { repoPath, filePath });
    }
    await fetch('/api/repo/unstage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, file_path: filePath }),
    });
  };

  const unstageAll = async (repoPath: string): Promise<void> => {
    await fetch('/api/repo/unstage-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath }),
    });
  };

  const discardFile = async (repoPath: string, filePath?: string): Promise<void> => {
    await fetch('/api/repo/discard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, file_path: filePath }),
    });
  };

  const createCommit = async (
    repoPath: string,
    message: string,
    author: string,
    email: string
  ): Promise<string> => {
    if (isTauri()) {
      return await invoke<string>('create_commit', {
        repoPath,
        message,
        author,
        email,
      });
    }
    const res = await fetch('/api/repo/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, message, author, email }),
    });
    const data = await res.json();
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

  // Merge operations
  const mergeBranch = async (
    repoPath: string,
    target: string,
    strategy: 'default' | 'no-ff' | 'squash' | 'ff-only' = 'default',
    message?: string
  ): Promise<{ success: boolean; conflict?: boolean; error?: string }> => {
    const res = await fetch('/api/repo/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, target, strategy, message }),
    });
    return await res.json();
  };

  const abortMerge = async (repoPath: string): Promise<void> => {
    await fetch('/api/repo/merge/abort', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath }),
    });
  };

  // Rebase operations
  const rebase = async (
    repoPath: string,
    upstream: string
  ): Promise<{ success: boolean; conflict?: boolean; error?: string }> => {
    const res = await fetch('/api/repo/rebase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, upstream }),
    });
    return await res.json();
  };

  const continueRebase = async (repoPath: string): Promise<void> => {
    await fetch('/api/repo/rebase/continue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath }),
    });
  };

  const abortRebase = async (repoPath: string): Promise<void> => {
    await fetch('/api/repo/rebase/abort', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath }),
    });
  };

  // Cherry-pick operations
  const cherryPick = async (
    repoPath: string,
    commitId: string
  ): Promise<{ success: boolean; conflict?: boolean; error?: string }> => {
    const res = await fetch('/api/repo/cherry-pick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, commit_id: commitId }),
    });
    return await res.json();
  };

  const continueCherryPick = async (repoPath: string): Promise<void> => {
    await fetch('/api/repo/cherry-pick/continue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath }),
    });
  };

  const abortCherryPick = async (repoPath: string): Promise<void> => {
    await fetch('/api/repo/cherry-pick/abort', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath }),
    });
  };

  // Revert & Reset
  const revertCommit = async (repoPath: string, commitId: string): Promise<{ success: boolean; output?: string }> => {
    const res = await fetch('/api/repo/revert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, commit_id: commitId }),
    });
    return await res.json();
  };

  const reset = async (repoPath: string, target: string, mode: '--soft' | '--mixed' | '--hard' = '--mixed'): Promise<void> => {
    await fetch('/api/repo/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath, target, mode }),
    });
  };

  const fetchRemote = async (repoPath: string): Promise<void> => {
    await fetch('/api/repo/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath }),
    });
  };

  const pullRemote = async (repoPath: string): Promise<void> => {
    await fetch('/api/repo/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath }),
    });
  };

  const pushRemote = async (repoPath: string): Promise<void> => {
    await fetch('/api/repo/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_path: repoPath }),
    });
  };

  const generateCommitMessage = async (
    diffText: string,
    config: LlmConfig
  ): Promise<GeneratedCommitMessage> => {
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
