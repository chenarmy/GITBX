import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { RepositoryInfo } from '@/types/git';

const mockGitApi = {
  fetchRemote: vi.fn(),
  pullRemote: vi.fn(),
  pushRemote: vi.fn(),
  getSyncStatus: vi.fn(),
  getRepoInfo: vi.fn(),
  getRepoStatus: vi.fn(),
  listBranches: vi.fn(),
  listRemotes: vi.fn(),
  listTags: vi.fn(),
  listStashes: vi.fn(),
  getCommitGraph: vi.fn(),
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

function makeRepoInfo(path: string, head = 'main'): RepositoryInfo {
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
    tags: [],
  };
}

function installMemoryLocalStorage() {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, String(value));
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    },
  });
  return storage;
}

describe('repo store scoped bulk operations', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    vi.clearAllMocks();
    setActivePinia(createPinia());

    mockGitApi.fetchRemote.mockResolvedValue(undefined);
    mockGitApi.pullRemote.mockResolvedValue(undefined);
    mockGitApi.pushRemote.mockResolvedValue(undefined);
    mockGitApi.getSyncStatus.mockResolvedValue({ incoming: [], outgoing: [] });
    mockGitApi.getRepoInfo.mockImplementation(async (path: string) => makeRepoInfo(path));
    mockGitApi.getRepoStatus.mockResolvedValue({
      staged_files: [],
      unstaged_files: [],
      untracked_files: [],
      conflicted_files: [],
      total_changes: 0,
    });
    mockGitApi.listBranches.mockResolvedValue([]);
    mockGitApi.listRemotes.mockResolvedValue([]);
    mockGitApi.listTags.mockResolvedValue([]);
    mockGitApi.listStashes.mockResolvedValue([]);
    mockGitApi.getCommitGraph.mockResolvedValue({ nodes: [], has_more: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches only scoped repositories and skips reloading an active repo outside the scope', async () => {
    const store = useRepoStore();
    store.repoList = [
      { path: '/repos/g1-a', name: 'g1-a', lastOpened: 1, group: 'Group1' },
      { path: '/repos/g1-b', name: 'g1-b', lastOpened: 2, group: 'Group1' },
      { path: '/repos/g2-a', name: 'g2-a', lastOpened: 3, group: 'Group2' },
      { path: '/repos/ungrouped', name: 'ungrouped', lastOpened: 4 },
    ];
    store.activeRepoPath = '/repos/g2-a';

    const result = await store.fetchAllRepos(['/repos/g1-a', '/repos/g1-b', '/repos/g1-a']);

    expect(result).toEqual({
      succeeded: ['/repos/g1-a', '/repos/g1-b'],
      failed: [],
    });
    expect(mockGitApi.fetchRemote.mock.calls.map(([path]) => path)).toEqual([
      '/repos/g1-a',
      '/repos/g1-b',
    ]);
    expect(mockGitApi.getSyncStatus.mock.calls.map(([path]) => path)).toEqual([
      '/repos/g1-a',
      '/repos/g1-b',
    ]);
    expect(mockGitApi.getRepoInfo).not.toHaveBeenCalled();
  });

  it('reloads active repository when activeRepoPath is inside the scoped fetch targets', async () => {
    const store = useRepoStore();
    store.repoList = [
      { path: '/repos/g1-a', name: 'g1-a', lastOpened: 1, group: 'Group1' },
      { path: '/repos/g2-a', name: 'g2-a', lastOpened: 2, group: 'Group2' },
    ];
    store.activeRepoPath = '/repos/g1-a';

    const result = await store.fetchAllRepos(['/repos/g1-a']);

    expect(result).toEqual({ succeeded: ['/repos/g1-a'], failed: [] });
    expect(mockGitApi.fetchRemote).toHaveBeenCalledTimes(1);
    expect(mockGitApi.fetchRemote).toHaveBeenCalledWith('/repos/g1-a');
    expect(mockGitApi.getRepoInfo).toHaveBeenCalledTimes(1);
    expect(mockGitApi.getRepoInfo).toHaveBeenCalledWith('/repos/g1-a');
  });

  it('pulls only scoped repositories with the given strategy and reports partial results', async () => {
    const store = useRepoStore();
    store.repoList = [
      { path: '/repos/g1-a', name: 'g1-a', lastOpened: 1, group: 'Group1' },
      { path: '/repos/g1-b', name: 'g1-b', lastOpened: 2, group: 'Group1' },
      { path: '/repos/g2-a', name: 'g2-a', lastOpened: 3, group: 'Group2' },
    ];
    store.activeRepoPath = '/repos/g2-a';

    mockGitApi.pullRemote.mockImplementation(async (path: string) => {
      if (path === '/repos/g1-b') {
        throw new Error('rebase conflict');
      }
    });

    const result = await store.pullAllRepos('rebase', ['/repos/g1-a', '/repos/g1-b']);

    expect(result).toEqual({
      succeeded: ['/repos/g1-a'],
      failed: [{ path: '/repos/g1-b', error: 'rebase conflict' }],
    });
    expect(mockGitApi.pullRemote.mock.calls).toEqual([
      ['/repos/g1-a', 'rebase'],
      ['/repos/g1-b', 'rebase'],
    ]);
    expect(mockGitApi.getSyncStatus.mock.calls.map(([path]) => path)).toEqual([
      '/repos/g1-a',
      '/repos/g1-b',
    ]);
    expect(mockGitApi.getRepoInfo).not.toHaveBeenCalled();
  });

  it('pushes only scoped repositories and leaves other repositories untouched', async () => {
    const store = useRepoStore();
    store.repoList = [
      { path: '/repos/g1-a', name: 'g1-a', lastOpened: 1, group: 'Group1' },
      { path: '/repos/g1-b', name: 'g1-b', lastOpened: 2, group: 'Group1' },
      { path: '/repos/g2-a', name: 'g2-a', lastOpened: 3, group: 'Group2' },
    ];
    store.activeRepoPath = '/repos/g2-a';

    mockGitApi.pushRemote.mockImplementation(async (path: string) => {
      if (path === '/repos/g1-a') {
        throw new Error('non-fast-forward');
      }
    });

    const result = await store.pushAllRepos(true, ['/repos/g1-a', '/repos/g1-b']);

    expect(result).toEqual({
      succeeded: ['/repos/g1-b'],
      failed: [{ path: '/repos/g1-a', error: 'non-fast-forward' }],
    });
    expect(mockGitApi.pushRemote.mock.calls).toEqual([
      ['/repos/g1-a', true],
      ['/repos/g1-b', true],
    ]);
    expect(mockGitApi.getSyncStatus.mock.calls.map(([path]) => path)).toEqual([
      '/repos/g1-a',
      '/repos/g1-b',
    ]);
    expect(mockGitApi.getRepoInfo).not.toHaveBeenCalled();
  });

  it('returns empty results without calling any Git APIs when scoped repoPaths is empty', async () => {
    const store = useRepoStore();
    store.repoList = [
      { path: '/repos/g1-a', name: 'g1-a', lastOpened: 1, group: 'Group1' },
    ];
    store.activeRepoPath = '/repos/g1-a';

    await expect(store.fetchAllRepos([])).resolves.toEqual({ succeeded: [], failed: [] });
    await expect(store.pullAllRepos('merge', [])).resolves.toEqual({ succeeded: [], failed: [] });
    await expect(store.pushAllRepos(false, [])).resolves.toEqual({ succeeded: [], failed: [] });

    expect(mockGitApi.fetchRemote).not.toHaveBeenCalled();
    expect(mockGitApi.pullRemote).not.toHaveBeenCalled();
    expect(mockGitApi.pushRemote).not.toHaveBeenCalled();
    expect(mockGitApi.getSyncStatus).not.toHaveBeenCalled();
    expect(mockGitApi.getRepoInfo).not.toHaveBeenCalled();
  });

  it('operates on all repositories when repoPaths is omitted', async () => {
    const store = useRepoStore();
    store.repoList = [
      { path: '/repos/g1-a', name: 'g1-a', lastOpened: 1, group: 'Group1' },
      { path: '/repos/g2-a', name: 'g2-a', lastOpened: 2, group: 'Group2' },
      { path: '/repos/ungrouped', name: 'ungrouped', lastOpened: 3 },
    ];
    store.activeRepoPath = '/repos/g1-a';

    const fetchResult = await store.fetchAllRepos();
    expect(fetchResult.succeeded).toEqual(['/repos/g1-a', '/repos/g2-a', '/repos/ungrouped']);
    expect(mockGitApi.fetchRemote.mock.calls.map(([path]) => path)).toEqual([
      '/repos/g1-a',
      '/repos/g2-a',
      '/repos/ungrouped',
    ]);

    const pullResult = await store.pullAllRepos('ff-only');
    expect(pullResult.succeeded).toEqual(['/repos/g1-a', '/repos/g2-a', '/repos/ungrouped']);
    expect(mockGitApi.pullRemote.mock.calls).toEqual([
      ['/repos/g1-a', 'ff-only'],
      ['/repos/g2-a', 'ff-only'],
      ['/repos/ungrouped', 'ff-only'],
    ]);

    const pushResult = await store.pushAllRepos(false);
    expect(pushResult.succeeded).toEqual(['/repos/g1-a', '/repos/g2-a', '/repos/ungrouped']);
    expect(mockGitApi.pushRemote.mock.calls).toEqual([
      ['/repos/g1-a', false],
      ['/repos/g2-a', false],
      ['/repos/ungrouped', false],
    ]);
  });
});
