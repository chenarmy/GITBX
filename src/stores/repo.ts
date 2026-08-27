import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { RepositoryInfo, RepoStatusSummary, FileStatusItem, BranchItem, RemoteItem, TagItem, StashItem, SyncStatus } from '@/types/git';
import type { GraphCommitNode } from '@/types/graph';
import { formatGitError, useGitApi } from '@/composables/useGitApi';
import { useConsoleStore } from '@/stores/console';
import { useDiffStore } from '@/stores/diff';
import { CONFIG_KEYS, persistAppConfig } from '@/services/appConfig';

export interface ManagedRepo {
  path: string;
  name: string;
  lastOpened: number;
}

function normalizeStoredRepoPath(path: string): string {
  if (path.startsWith('\\\\?\\UNC\\')) return `\\\\${path.slice(8)}`;
  if (path.startsWith('\\\\?\\')) return path.slice(4);
  return path;
}

function emptyStatusSummary(): RepoStatusSummary {
  return {
    staged_files: [],
    unstaged_files: [],
    untracked_files: [],
    conflicted_files: [],
    total_changes: 0,
  };
}

function getInitialRepos(): ManagedRepo[] {
  try {
    const raw = localStorage.getItem(CONFIG_KEYS.repositories);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((repo) => ({ ...repo, path: normalizeStoredRepoPath(repo.path) }));
      }
    }
  } catch {}
  return [];
}

function getInitialActiveRepo(): string {
  try {
    const saved = localStorage.getItem(CONFIG_KEYS.activeRepository);
    if (saved) return normalizeStoredRepoPath(saved);
  } catch {}
  return '';
}

export const useRepoStore = defineStore('repo', () => {
  const gitApi = useGitApi();
  const consoleStore = useConsoleStore();
  const diffStore = useDiffStore();
  const repoList = ref<ManagedRepo[]>(getInitialRepos());
  const activeRepoPath = ref<string>(getInitialActiveRepo());
  const repoInfo = ref<RepositoryInfo | null>(null);
  const statusSummary = ref<RepoStatusSummary>(emptyStatusSummary());
  const branches = ref<BranchItem[]>([]);
  const remotes = ref<RemoteItem[]>([]);
  const tags = ref<TagItem[]>([]);
  const stashes = ref<StashItem[]>([]);
  const syncStatus = ref<SyncStatus>({ incoming: [], outgoing: [] });
  const isSyncStatusOpen = ref(false);
  const isWorktreeManagerOpen = ref(false);
  const isPullRequestOpen = ref(false);
  const commitNodes = ref<GraphCommitNode[]>([]);
  const graphHasMore = ref(false);
  const isLoadingMoreCommits = ref(false);
  const selectedCommit = ref<GraphCommitNode | null>(null);
  const selectedCommitFiles = ref<FileStatusItem[]>([]);
  const branchComparison = ref<{
    baseBranch: string;
    targetBranch: string;
    baseCommitId: string;
    targetCommitId: string;
  } | null>(null);
  const branchComparisonFiles = ref<FileStatusItem[]>([]);
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
  const isRemoteModalOpen = ref<boolean>(false);

  // Context target data
  const targetBranchForAction = ref<string>('');
  const targetCommitForAction = ref<string>('');

  const saveReposToStorage = () => {
    try {
      localStorage.setItem(CONFIG_KEYS.repositories, JSON.stringify(repoList.value));
      localStorage.setItem(CONFIG_KEYS.activeRepository, activeRepoPath.value);
    } catch {}
    void persistAppConfig().catch((error) => {
      consoleStore.logWarning('Failed to save user configuration.', formatGitError(error));
    });
  };

  const clearLoadedRepoData = () => {
    repoInfo.value = null;
    statusSummary.value = emptyStatusSummary();
    branches.value = [];
    remotes.value = [];
    tags.value = [];
    stashes.value = [];
    commitNodes.value = [];
    graphHasMore.value = false;
    selectedCommit.value = null;
    selectedCommitFiles.value = [];
    branchComparison.value = null;
    branchComparisonFiles.value = [];
  };

  const loadRepo = async (targetPath?: string) => {
    const path = targetPath || activeRepoPath.value;
    if (!path) {
      clearLoadedRepoData();
      return false;
    }
    if (path !== activeRepoPath.value) {
      diffStore.clearSelection();
    }
    isLoading.value = true;
    errorMessage.value = null;
    activeRepoPath.value = path;
    saveReposToStorage();
    clearLoadedRepoData();

    try {
      const info = await gitApi.getRepoInfo(path);
      repoInfo.value = info;

      const existing = repoList.value.find((r) => r.path === path);
      if (existing && info.name) {
        existing.name = info.name;
        existing.lastOpened = Date.now();
        saveReposToStorage();
      }

      const [statusResult, branchResult, remoteResult, tagResult, stashResult, graphResult] = await Promise.allSettled([
        gitApi.getRepoStatus(path),
        gitApi.listBranches(path),
        gitApi.listRemotes(path),
        gitApi.listTags(path),
        gitApi.listStashes(path),
        gitApi.getCommitGraph(path, 0, 150),
      ]);

      const failures: string[] = [];
      if (statusResult.status === 'fulfilled') statusSummary.value = statusResult.value;
      else failures.push(`status: ${formatGitError(statusResult.reason)}`);
      if (branchResult.status === 'fulfilled') branches.value = branchResult.value;
      else failures.push(`branches: ${formatGitError(branchResult.reason)}`);
      if (remoteResult.status === 'fulfilled') remotes.value = remoteResult.value;
      else failures.push(`remotes: ${formatGitError(remoteResult.reason)}`);
      if (tagResult.status === 'fulfilled') tags.value = tagResult.value;
      else failures.push(`tags: ${formatGitError(tagResult.reason)}`);
      if (stashResult.status === 'fulfilled') stashes.value = stashResult.value;
      else failures.push(`stashes: ${formatGitError(stashResult.reason)}`);
      if (graphResult.status === 'fulfilled') {
        commitNodes.value = graphResult.value.nodes;
        graphHasMore.value = graphResult.value.has_more;
        selectedCommit.value = graphResult.value.nodes[0] || null;
      } else {
        failures.push(`commit graph: ${formatGitError(graphResult.reason)}`);
      }

      if (failures.length) {
        errorMessage.value = failures.join('; ');
        consoleStore.logWarning('Repository opened with partial data.', errorMessage.value);
      }
      return true;
    } catch (err: any) {
      clearLoadedRepoData();
      errorMessage.value = formatGitError(err, 'Failed to open repository');
      consoleStore.logError('Failed to open repository.', errorMessage.value);
      return false;
    } finally {
      isLoading.value = false;
    }
  };

  const addRepo = async (newPath: string) => {
    const validation = await gitApi.validateRepo(newPath);
    if (!validation.valid) {
      throw new Error(validation.message || 'Invalid Git repository');
    }
    const cleanPath = normalizeStoredRepoPath(validation.path || newPath);
    const name = validation.name || cleanPath.split(/[\\/]/).pop() || 'Repo';

    const idx = repoList.value.findIndex((r) => r.path === cleanPath);
    if (idx === -1) {
      repoList.value.push({ path: cleanPath, name, lastOpened: Date.now() });
    } else {
      repoList.value[idx].lastOpened = Date.now();
    }
    saveReposToStorage();
    const loaded = await loadRepo(cleanPath);
    if (!loaded) throw new Error(errorMessage.value || 'Failed to open repository');
  };

  const removeRepo = (pathToRemove: string) => {
    repoList.value = repoList.value.filter((r) => r.path !== pathToRemove);
    if (activeRepoPath.value === pathToRemove) {
      if (repoList.value.length > 0) {
        loadRepo(repoList.value[0].path);
      } else {
        activeRepoPath.value = '';
        clearLoadedRepoData();
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

  const commit = async (message: string, author: string, email: string, options: { amend?: boolean; sign?: boolean; preCommitCommand?: string } = {}) => {
    await gitApi.createCommit(activeRepoPath.value, message, author, email, options);
    await loadRepo(activeRepoPath.value);
  };

  const commitAndPush = async (message: string, author: string, email: string) => {
    await gitApi.commitAndPush(activeRepoPath.value, message, author, email);
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

  const updateRemoteUrl = async (remoteName: string, url: string, pushUrl?: string) => {
    await gitApi.setRemoteUrl(activeRepoPath.value, remoteName, url, pushUrl);
    remotes.value = await gitApi.listRemotes(activeRepoPath.value);
    repoInfo.value = await gitApi.getRepoInfo(activeRepoPath.value);
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

  const selectCommit = async (commit: GraphCommitNode | null) => {
    branchComparison.value = null;
    branchComparisonFiles.value = [];
    selectedCommit.value = commit;
    if (!commit || !activeRepoPath.value) {
      selectedCommitFiles.value = [];
      diffStore.clearSelection();
      return;
    }
    try {
      const files = await gitApi.getCommitChanges(activeRepoPath.value, commit.id);
      selectedCommitFiles.value = files;
      if (files.length > 0) {
        await diffStore.selectFile(files[0].path, false, activeRepoPath.value, commit.id);
      } else {
        diffStore.clearSelection();
      }
    } catch {
      selectedCommitFiles.value = [];
      diffStore.clearSelection();
    }
  };

  const interactiveRebase = async (upstream: string, plan: import('@/types/git').RebasePlanItem[]) => {
    await gitApi.interactiveRebase(activeRepoPath.value, upstream, plan);
    await loadRepo(activeRepoPath.value);
  };

  const applyStash = async (index: number) => {
    await gitApi.applyStash(activeRepoPath.value, index);
    await loadRepo(activeRepoPath.value);
  };

  const dropStash = async (index: number) => {
    await gitApi.dropStash(activeRepoPath.value, index);
    await loadRepo(activeRepoPath.value);
  };

  const renameStash = async (index: number, message: string) => {
    await gitApi.renameStash(activeRepoPath.value, index, message);
    await loadRepo(activeRepoPath.value);
  };

  const createShelf = async (message: string, filePaths: string[]) => {
    await gitApi.createShelf(activeRepoPath.value, message, filePaths);
    await loadRepo(activeRepoPath.value);
  };

  const loadMoreCommits = async () => {
    if (!activeRepoPath.value || !graphHasMore.value || isLoadingMoreCommits.value) return [];
    isLoadingMoreCommits.value = true;
    try {
      const page = await gitApi.getCommitGraph(activeRepoPath.value, commitNodes.value.length, 150);
      const existing = new Set(commitNodes.value.map((commit) => commit.id));
      const additions = page.nodes.filter((commit) => !existing.has(commit.id));
      commitNodes.value.push(...additions);
      graphHasMore.value = page.has_more;
      return additions;
    } finally {
      isLoadingMoreCommits.value = false;
    }
  };

  const locateCommit = async (commitId: string) => {
    let commit = commitNodes.value.find((item) => item.id === commitId);
    while (!commit && graphHasMore.value) {
      const additions = await loadMoreCommits();
      commit = additions.find((item) => item.id === commitId);
      if (additions.length === 0 && graphHasMore.value) break;
    }
    if (!commit) return false;
    await selectCommit(commit);
    return true;
  };

  const locateRevision = async (revision: string) => {
    const commitId = await gitApi.resolveRevision(activeRepoPath.value, revision);
    return await locateCommit(commitId);
  };

  const compareBranch = async (branch: BranchItem) => {
    const baseCommitId = repoInfo.value?.head_commit_id;
    const baseBranch = repoInfo.value?.head_branch || 'HEAD';
    if (!activeRepoPath.value || !baseCommitId) {
      throw new Error('The current branch has no commit to compare.');
    }

    selectedCommit.value = null;
    selectedCommitFiles.value = [];
    diffStore.clearSelection();
    branchComparison.value = {
      baseBranch,
      targetBranch: branch.name,
      baseCommitId,
      targetCommitId: branch.target_commit_id,
    };

    try {
      const files = await gitApi.getBranchChanges(
        activeRepoPath.value,
        baseCommitId,
        branch.target_commit_id,
      );
      branchComparisonFiles.value = files;
      if (files.length > 0) {
        const first = files[0];
        await diffStore.selectBranchComparisonFile(
          first.path,
          first.old_path,
          activeRepoPath.value,
          baseCommitId,
          branch.target_commit_id,
        );
      }
      return files;
    } catch (error) {
      branchComparison.value = null;
      branchComparisonFiles.value = [];
      diffStore.clearSelection();
      throw error;
    }
  };

  const clearBranchComparison = () => {
    branchComparison.value = null;
    branchComparisonFiles.value = [];
    diffStore.clearSelection();
  };

  const continueRevert = async () => {
    await gitApi.continueRevert(activeRepoPath.value);
    await loadRepo(activeRepoPath.value);
  };

  const abortRevert = async () => {
    await gitApi.abortMerge(activeRepoPath.value);
    await loadRepo(activeRepoPath.value);
  };

  const reset = async (target: string, mode: '--soft' | '--mixed' | '--hard' = '--mixed') => {
    await gitApi.reset(activeRepoPath.value, target, mode);
    await loadRepo(activeRepoPath.value);
  };

  const fetchRemote = async () => {
    await gitApi.fetchRemote(activeRepoPath.value);
    await loadRepo(activeRepoPath.value);
    syncStatus.value = await gitApi.getSyncStatus(activeRepoPath.value).catch(() => ({ incoming: [], outgoing: [] }));
  };

  const pullRemote = async (strategy: 'merge' | 'rebase' | 'ff-only' = 'merge') => {
    try {
      await gitApi.pullRemote(activeRepoPath.value, strategy);
    } finally {
      await loadRepo(activeRepoPath.value);
    }
  };

  const pushRemote = async (forceWithLease = false) => {
    await gitApi.pushRemote(activeRepoPath.value, forceWithLease);
    await loadRepo(activeRepoPath.value);
    syncStatus.value = await gitApi.getSyncStatus(activeRepoPath.value).catch(() => ({ incoming: [], outgoing: [] }));
  };

  const refreshSyncStatus = async () => {
    syncStatus.value = await gitApi.getSyncStatus(activeRepoPath.value);
  };

  const discoverRoots = async () => {
    const roots = await gitApi.discoverGitRoots(activeRepoPath.value);
    for (const path of roots) {
      if (repoList.value.some((repo) => repo.path === path)) continue;
      const validation = await gitApi.validateRepo(path);
      if (validation.valid) repoList.value.push({ path, name: validation.name || path.split(/[\\/]/).pop() || path, lastOpened: Date.now() });
    }
    saveReposToStorage();
    return roots.length;
  };

  return {
    repoList,
    activeRepoPath,
    repoInfo,
    statusSummary,
    branches,
    remotes,
    tags,
    stashes,
    syncStatus,
    isSyncStatusOpen,
    isWorktreeManagerOpen,
    isPullRequestOpen,
    commitNodes,
    graphHasMore,
    isLoadingMoreCommits,
    selectedCommit,
    selectedCommitFiles,
    branchComparison,
    branchComparisonFiles,
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
    isRemoteModalOpen,
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
    commitAndPush,
    checkoutBranch,
    createBranch,
    deleteBranch,
    renameBranch,
    updateRemoteUrl,
    createTag,
    createStash,
    popStash,
    applyStash,
    dropStash,
    renameStash,
    createShelf,
    selectCommit,
    loadMoreCommits,
    locateCommit,
    locateRevision,
    compareBranch,
    clearBranchComparison,
    mergeBranch,
    abortMerge,
    continueMerge,
    rebase,
    interactiveRebase,
    continueRebase,
    abortRebase,
    cherryPick,
    continueCherryPick,
    abortCherryPick,
    revertCommit,
    continueRevert,
    abortRevert,
    reset,
    fetchRemote,
    pullRemote,
    pushRemote,
    refreshSyncStatus,
    discoverRoots,
  };
});
