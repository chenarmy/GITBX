import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { BranchItem, RepositoryInfo, TagItem } from '@/types/git';
import type { GraphCommitNode } from '@/types/graph';

const mockGitApi = {
  getRepoInfo: vi.fn(),
  getRepoStatus: vi.fn(),
  listBranches: vi.fn(),
  listRemotes: vi.fn(),
  listTags: vi.fn(),
  listStashes: vi.fn(),
  getCommitGraph: vi.fn(),
  getSyncStatus: vi.fn(),
};

vi.mock('@/composables/useGitApi', () => ({
  useGitApi: () => mockGitApi,
  formatGitError: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

vi.mock('@/services/appConfig', () => ({
  CONFIG_KEYS: {
    repositories: 'gitbx_repos',
    repositoryGroups: 'gitbx_repo_groups',
    activeRepository: 'gitbx_active_repo',
  },
  persistAppConfig: vi.fn().mockResolvedValue(undefined),
}));

import { useRepoStore } from '@/stores/repo';

function makeRepoInfo(path: string, head: string): RepositoryInfo {
  return {
    path,
    name: path.split(/[\\/]/).pop() || 'repo',
    head_branch: head,
    head_commit_id: 'abc1234',
    is_detached: false,
    is_bare: false,
    has_conflicts: false,
    merge_state: 'None',
    remotes: ['origin'],
    local_branches: [head],
    remote_branches: [`origin/${head}`],
    tags: ['v1.0.0'],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('repo store refresh behavior', () => {
  const storage: Record<string, string> = {};

  beforeEach(() => {
    for (const key of Object.keys(storage)) delete storage[key];
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, value: string) => {
        storage[key] = value;
      },
      removeItem: (key: string) => {
        delete storage[key];
      },
      clear: () => {
        for (const key of Object.keys(storage)) delete storage[key];
      },
    });
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps existing repo state populated while refreshing the active repository', async () => {
    const repoStore = useRepoStore();
    const initialBranches: BranchItem[] = [
      {
        name: 'main',
        full_name: 'refs/heads/main',
        is_head: true,
        is_remote: false,
        commit_id: 'abc1234',
        upstream: 'origin/main',
        ahead: 0,
        behind: 0,
      },
    ];
    const initialTags: TagItem[] = [
      { name: 'v1.0.0', target_commit_id: 'abc1234', message: 'Release 1.0.0' },
    ];
    const initialNode = {
      id: 'abc1234',
      short_id: 'abc1234',
      message: 'Initial commit',
      summary: 'Initial commit',
      author_name: 'Dev',
      author_email: 'dev@example.com',
      timestamp: 1700000000,
      parent_ids: [],
      refs: [],
    } as unknown as GraphCommitNode;

    repoStore.activeRepoPath = 'I:/repos/demo';
    repoStore.repoInfo = makeRepoInfo('I:/repos/demo', 'main');
    repoStore.branches = initialBranches;
    repoStore.tags = initialTags;
    repoStore.commitNodes = [initialNode];
    repoStore.selectedCommit = initialNode;

    const infoDeferred = deferred<RepositoryInfo>();
    const branchesDeferred = deferred<BranchItem[]>();
    mockGitApi.getRepoInfo.mockReturnValueOnce(infoDeferred.promise);
    mockGitApi.listBranches.mockReturnValueOnce(branchesDeferred.promise);
    mockGitApi.getRepoStatus.mockResolvedValue({
      staged_files: [],
      unstaged_files: [],
      untracked_files: [],
      conflicted_files: [],
      total_changes: 0,
    });
    mockGitApi.listRemotes.mockResolvedValue([]);
    mockGitApi.listTags.mockResolvedValue([
      ...initialTags,
      { name: 'v1.1.0', target_commit_id: 'abc1234', message: 'Release 1.1.0' },
    ]);
    mockGitApi.listStashes.mockResolvedValue([]);
    mockGitApi.getSyncStatus.mockResolvedValue({ incoming: [], outgoing: [] });
    mockGitApi.getCommitGraph.mockResolvedValue({ nodes: [initialNode], has_more: false });

    const loadPromise = repoStore.loadRepo('I:/repos/demo');

    expect(repoStore.isLoading).toBe(true);
    expect(repoStore.repoInfo?.name).toBe('demo');
    expect(repoStore.branches).toHaveLength(1);
    expect(repoStore.tags).toHaveLength(1);
    expect(repoStore.commitNodes).toHaveLength(1);

    infoDeferred.resolve(makeRepoInfo('I:/repos/demo', 'main'));
    await vi.waitFor(() => {
      expect(mockGitApi.listBranches).toHaveBeenCalledWith('I:/repos/demo');
    });

    // Existing data remains visible behind the overlay while parallel fetches finish.
    expect(repoStore.branches).toHaveLength(1);
    expect(repoStore.tags).toHaveLength(1);
    expect(repoStore.selectedCommit?.id).toBe('abc1234');

    branchesDeferred.resolve(initialBranches);
    const loaded = await loadPromise;
    expect(repoStore.errorMessage).toBeNull();
    expect(loaded).toBe(true);
    expect(repoStore.isLoading).toBe(false);
    expect(repoStore.tags.map((t) => t.name)).toContain('v1.1.0');
  });

  it('clears previous repository state when switching to a different repository', async () => {
    const repoStore = useRepoStore();
    repoStore.activeRepoPath = 'I:/repos/first';
    repoStore.repoInfo = makeRepoInfo('I:/repos/first', 'main');
    repoStore.tags = [{ name: 'old-tag', target_commit_id: '111', message: null }];

    const branchesDeferred = deferred<BranchItem[]>();
    mockGitApi.getRepoInfo.mockResolvedValueOnce(makeRepoInfo('I:/repos/second', 'develop'));
    mockGitApi.listBranches.mockReturnValueOnce(branchesDeferred.promise);
    mockGitApi.getRepoStatus.mockResolvedValue({
      staged_files: [],
      unstaged_files: [],
      untracked_files: [],
      conflicted_files: [],
      total_changes: 0,
    });
    mockGitApi.listRemotes.mockResolvedValue([]);
    mockGitApi.listTags.mockResolvedValue([]);
    mockGitApi.listStashes.mockResolvedValue([]);
    mockGitApi.getSyncStatus.mockResolvedValue({ incoming: [], outgoing: [] });
    mockGitApi.getCommitGraph.mockResolvedValue({ nodes: [], has_more: false });

    const switchPromise = repoStore.loadRepo('I:/repos/second');
    await vi.waitFor(() => {
      expect(repoStore.activeRepoPath).toBe('I:/repos/second');
    });

    expect(repoStore.tags).toEqual([]);

    branchesDeferred.resolve([]);
    await expect(switchPromise).resolves.toBe(true);
    expect(repoStore.isLoading).toBe(false);
  });
});
