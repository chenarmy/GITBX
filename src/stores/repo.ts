import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { RepositoryInfo, RepoStatusSummary, BranchItem, TagItem, StashItem } from '@/types/git';
import type { GraphCommitNode } from '@/types/graph';
import { useGitApi } from '@/composables/useGitApi';

export interface ManagedRepo {
  path: string;
  name: string;
  lastOpened: number;
}

const STORAGE_KEY = 'gitbx_managed_repos';
const ACTIVE_REPO_KEY = 'gitbx_active_repo';

function getInitialRepos(): ManagedRepo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [];
}

function getInitialActiveRepo(): string {
  try {
    const saved = localStorage.getItem(ACTIVE_REPO_KEY);
    if (saved) return saved;
  } catch {}
  return '';
}

export const useRepoStore = defineStore('repo', () => {
  const gitApi = useGitApi();
  const repoList = ref<ManagedRepo[]>(getInitialRepos());
  const activeRepoPath = ref<string>(getInitialActiveRepo());
  const repoInfo = ref<RepositoryInfo | null>(null);
  const statusSummary = ref<RepoStatusSummary>({
    staged_files: [],
    unstaged_files: [],
    untracked_files: [],
    conflicted_files: [],
    total_changes: 0,
  });
  const branches = ref<BranchItem[]>([]);
  const tags = ref<TagItem[]>([]);
  const stashes = ref<StashItem[]>([]);
  const commitNodes = ref<GraphCommitNode[]>([]);
  const selectedCommit = ref<GraphCommitNode | null>(null);
  const isLoading = ref<boolean>(false);
  const errorMessage = ref<string | null>(null);

  // Dialog & Modal states
  const isAddRepoModalOpen = ref<boolean>(false);
  const isBranchModalOpen = ref<boolean>(false);
  const isTagModalOpen = ref<boolean>(false);
  const isStashModalOpen = ref<boolean>(false);
  const isMergeModalOpen = ref<boolean>(false);
  const isRebaseModalOpen = ref<boolean>(false);
  const isRenameBranchModalOpen = ref<boolean>(false);
  const isResetModalOpen = ref<boolean>(false);

  // Context target data
  const targetBranchForAction = ref<string>('');
  const targetCommitForAction = ref<string>('');

  const saveReposToStorage = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(repoList.value));
      localStorage.setItem(ACTIVE_REPO_KEY, activeRepoPath.value);
    } catch {}
  };

  const loadRepo = async (targetPath?: string) => {
    const path = targetPath || activeRepoPath.value;
    isLoading.value = true;
    errorMessage.value = null;
    activeRepoPath.value = path;
    saveReposToStorage();

    try {
      const [info, status, branchList, tagList, stashList, graph] = await Promise.all([
        gitApi.getRepoInfo(path),
        gitApi.getRepoStatus(path),
        gitApi.listBranches(path),
        gitApi.listTags(path),
        gitApi.listStashes(path),
        gitApi.getCommitGraph(path, 150),
      ]);

      repoInfo.value = info;
      statusSummary.value = status;
      branches.value = branchList;
      tags.value = tagList;
      stashes.value = stashList;
      commitNodes.value = graph;

      if (graph.length > 0) {
        selectedCommit.value = graph[0];
      }

      const existing = repoList.value.find((r) => r.path === path);
      if (existing && info.name) {
        existing.name = info.name;
        existing.lastOpened = Date.now();
        saveReposToStorage();
      }
    } catch (err: any) {
      console.error('Failed to load repo:', err);
      errorMessage.value = err?.message || String(err);
    } finally {
      isLoading.value = false;
    }
  };

  const addRepo = async (newPath: string) => {
    const validation = await gitApi.validateRepo(newPath);
    if (!validation.valid) {
      throw new Error(validation.message || 'Invalid Git repository');
    }
    const cleanPath = validation.path || newPath;
    const name = validation.name || cleanPath.split(/[\\/]/).pop() || 'Repo';

    const idx = repoList.value.findIndex((r) => r.path === cleanPath);
    if (idx === -1) {
      repoList.value.push({ path: cleanPath, name, lastOpened: Date.now() });
    } else {
      repoList.value[idx].lastOpened = Date.now();
    }
    saveReposToStorage();
    await loadRepo(cleanPath);
  };

  const removeRepo = (pathToRemove: string) => {
    repoList.value = repoList.value.filter((r) => r.path !== pathToRemove);
    if (activeRepoPath.value === pathToRemove) {
      if (repoList.value.length > 0) {
        loadRepo(repoList.value[0].path);
      } else {
        activeRepoPath.value = '';
        repoInfo.value = null;
        statusSummary.value = { staged_files: [], unstaged_files: [], untracked_files: [], conflicted_files: [], total_changes: 0 };
        branches.value = [];
        tags.value = [];
        stashes.value = [];
        commitNodes.value = [];
      }
    }
    saveReposToStorage();
  };

  const switchRepo = async (path: string) => {
    await loadRepo(path);
  };

  const stageFile = async (filePath: string) => {
    await gitApi.stageFile(activeRepoPath.value, filePath);
    await loadRepo(activeRepoPath.value);
  };

  const stageAll = async () => {
    await gitApi.stageAll(activeRepoPath.value);
    await loadRepo(activeRepoPath.value);
  };

  const unstageFile = async (filePath: string) => {
    await gitApi.unstageFile(activeRepoPath.value, filePath);
    await loadRepo(activeRepoPath.value);
  };

  const unstageAll = async () => {
    await gitApi.unstageAll(activeRepoPath.value);
    await loadRepo(activeRepoPath.value);
  };

  const discardFile = async (filePath?: string) => {
    await gitApi.discardFile(activeRepoPath.value, filePath);
    await loadRepo(activeRepoPath.value);
  };

  const commit = async (message: string, author: string, email: string) => {
    await gitApi.createCommit(activeRepoPath.value, message, author, email);
    await loadRepo(activeRepoPath.value);
  };

  const checkoutBranch = async (branchName: string) => {
    await gitApi.checkoutBranch(activeRepoPath.value, branchName);
    await loadRepo(activeRepoPath.value);
  };

  const createBranch = async (name: string, startPoint?: string, checkout = true) => {
    await gitApi.createBranch(activeRepoPath.value, name, startPoint, checkout);
    await loadRepo(activeRepoPath.value);
  };

  const deleteBranch = async (name: string, force = false) => {
    await gitApi.deleteBranch(activeRepoPath.value, name, force);
    await loadRepo(activeRepoPath.value);
  };

  const renameBranch = async (oldName: string, newName: string) => {
    await gitApi.renameBranch(activeRepoPath.value, oldName, newName);
    await loadRepo(activeRepoPath.value);
  };

  const createTag = async (name: string, message?: string, commitId?: string) => {
    await gitApi.createTag(activeRepoPath.value, name, message, commitId);
    await loadRepo(activeRepoPath.value);
  };

  const createStash = async (message?: string) => {
    await gitApi.createStash(activeRepoPath.value, message);
    await loadRepo(activeRepoPath.value);
  };

  const popStash = async (index = 0) => {
    await gitApi.popStash(activeRepoPath.value, index);
    await loadRepo(activeRepoPath.value);
  };

  // Merge, Rebase, Cherry-pick, Revert, Reset
  const mergeBranch = async (target: string, strategy: 'default' | 'no-ff' | 'squash' | 'ff-only' = 'default', message?: string) => {
    const res = await gitApi.mergeBranch(activeRepoPath.value, target, strategy, message);
    await loadRepo(activeRepoPath.value);
    return res;
  };

  const abortMerge = async () => {
    await gitApi.abortMerge(activeRepoPath.value);
    await loadRepo(activeRepoPath.value);
  };

  const continueMerge = async () => {
    await gitApi.continueMerge(activeRepoPath.value);
    await loadRepo(activeRepoPath.value);
  };

  const rebase = async (upstream: string) => {
    const res = await gitApi.rebase(activeRepoPath.value, upstream);
    await loadRepo(activeRepoPath.value);
    return res;
  };

  const continueRebase = async () => {
    await gitApi.continueRebase(activeRepoPath.value);
    await loadRepo(activeRepoPath.value);
  };

  const abortRebase = async () => {
    await gitApi.abortRebase(activeRepoPath.value);
    await loadRepo(activeRepoPath.value);
  };

  const cherryPick = async (commitId: string) => {
    const res = await gitApi.cherryPick(activeRepoPath.value, commitId);
    await loadRepo(activeRepoPath.value);
    return res;
  };

  const continueCherryPick = async () => {
    await gitApi.continueCherryPick(activeRepoPath.value);
    await loadRepo(activeRepoPath.value);
  };

  const abortCherryPick = async () => {
    await gitApi.abortCherryPick(activeRepoPath.value);
    await loadRepo(activeRepoPath.value);
  };

  const revertCommit = async (commitId: string) => {
    const res = await gitApi.revertCommit(activeRepoPath.value, commitId);
    await loadRepo(activeRepoPath.value);
    return res;
  };

  const reset = async (target: string, mode: '--soft' | '--mixed' | '--hard' = '--mixed') => {
    await gitApi.reset(activeRepoPath.value, target, mode);
    await loadRepo(activeRepoPath.value);
  };

  const fetchRemote = async () => {
    await gitApi.fetchRemote(activeRepoPath.value);
    await loadRepo(activeRepoPath.value);
  };

  const pullRemote = async () => {
    await gitApi.pullRemote(activeRepoPath.value);
    await loadRepo(activeRepoPath.value);
  };

  const pushRemote = async () => {
    await gitApi.pushRemote(activeRepoPath.value);
    await loadRepo(activeRepoPath.value);
  };

  return {
    repoList,
    activeRepoPath,
    repoInfo,
    statusSummary,
    branches,
    tags,
    stashes,
    commitNodes,
    selectedCommit,
    isLoading,
    errorMessage,
    isAddRepoModalOpen,
    isBranchModalOpen,
    isTagModalOpen,
    isStashModalOpen,
    isMergeModalOpen,
    isRebaseModalOpen,
    isRenameBranchModalOpen,
    isResetModalOpen,
    targetBranchForAction,
    targetCommitForAction,
    loadRepo,
    addRepo,
    removeRepo,
    switchRepo,
    stageFile,
    stageAll,
    unstageFile,
    unstageAll,
    discardFile,
    commit,
    checkoutBranch,
    createBranch,
    deleteBranch,
    renameBranch,
    createTag,
    createStash,
    popStash,
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
    reset,
    fetchRemote,
    pullRemote,
    pushRemote,
  };
});
