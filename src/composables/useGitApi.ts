import { invoke } from '@tauri-apps/api/core';
import type {
  RepositoryInfo,
  RepoStatusSummary,
  BranchItem,
} from '@/types/git';
import type { GraphCommitNode } from '@/types/graph';
import type {
  LlmConfig,
  GeneratedCommitMessage,
  SecretDetection,
} from '@/types/ai';

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function useGitApi() {
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

  const getCommitGraph = async (
    repoPath: string,
    maxCount: number = 200
  ): Promise<GraphCommitNode[]> => {
    if (isTauri()) {
      return await invoke<GraphCommitNode[]>('get_commit_graph', {
        repoPath,
        maxCount,
      });
    }
    const res = await fetch(`/api/repo/graph?path=${encodeURIComponent(repoPath)}`);
    return await res.json();
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

  const unstageFile = async (repoPath: string, filePath: string): Promise<void> => {
    if (isTauri()) {
      return await invoke('unstage_file', { repoPath, filePath });
    }
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
    getRepoInfo,
    getRepoStatus,
    listBranches,
    getCommitGraph,
    stageFile,
    unstageFile,
    createCommit,
    generateCommitMessage,
    scanSecrets,
  };
}
