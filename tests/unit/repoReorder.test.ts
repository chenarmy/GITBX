import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const mockPersistAppConfig = vi.fn().mockResolvedValue(undefined);

vi.mock('@/composables/useGitApi', () => ({
  useGitApi: () => ({}),
  formatGitError: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

vi.mock('@/services/appConfig', () => ({
  CONFIG_KEYS: {
    repositories: 'gitbx_repos',
    repositoryGroups: 'gitbx_repo_groups',
    activeRepository: 'gitbx_active_repo',
  },
  persistAppConfig: (...args: unknown[]) => mockPersistAppConfig(...args),
}));

import { useRepoStore } from '@/stores/repo';

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

describe('repo store drag-and-drop reordering', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    setActivePinia(createPinia());
    mockPersistAppConfig.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reorders repositories before and after targets and persists to storage', () => {
    const store = useRepoStore();
    store.repoList = [
      { path: '/repos/a', name: 'a', lastOpened: 1 },
      { path: '/repos/b', name: 'b', lastOpened: 2 },
      { path: '/repos/c', name: 'c', lastOpened: 3 },
    ];

    expect(store.reorderRepo('/repos/a', '/repos/c', 'after')).toBe(true);
    expect(store.repoList.map((r) => r.path)).toEqual(['/repos/b', '/repos/c', '/repos/a']);
    expect(mockPersistAppConfig).toHaveBeenCalledTimes(1);

    expect(store.reorderRepo('/repos/a', '/repos/b', 'before')).toBe(true);
    expect(store.repoList.map((r) => r.path)).toEqual(['/repos/a', '/repos/b', '/repos/c']);

    const saved = JSON.parse(localStorage.getItem('gitbx_repos') || '[]');
    expect(saved.map((r: { path: string }) => r.path)).toEqual(['/repos/a', '/repos/b', '/repos/c']);
  });

  it('moves repository into target group or ungrouped when reordering across groups', () => {
    const store = useRepoStore();
    store.repoGroups = ['Work', 'OSS'];
    store.repoList = [
      { path: '/repos/w1', name: 'w1', lastOpened: 1, group: 'Work' },
      { path: '/repos/w2', name: 'w2', lastOpened: 2, group: 'Work' },
      { path: '/repos/o1', name: 'o1', lastOpened: 3, group: 'OSS' },
      { path: '/repos/u1', name: 'u1', lastOpened: 4 },
    ];

    expect(store.reorderRepo('/repos/u1', '/repos/w2', 'before')).toBe(true);
    expect(store.repoList.map((r) => ({ path: r.path, group: r.group }))).toEqual([
      { path: '/repos/w1', group: 'Work' },
      { path: '/repos/u1', group: 'Work' },
      { path: '/repos/w2', group: 'Work' },
      { path: '/repos/o1', group: 'OSS' },
    ]);

    expect(store.reorderRepo('/repos/w1', '/repos/o1', 'after')).toBe(true);
    expect(store.repoList.map((r) => ({ path: r.path, group: r.group }))).toEqual([
      { path: '/repos/u1', group: 'Work' },
      { path: '/repos/w2', group: 'Work' },
      { path: '/repos/o1', group: 'OSS' },
      { path: '/repos/w1', group: 'OSS' },
    ]);
  });

  it('returns false for same-repo or missing repo paths', () => {
    const store = useRepoStore();
    store.repoList = [{ path: '/repos/a', name: 'a', lastOpened: 1 }];

    expect(store.reorderRepo('/repos/a', '/repos/a', 'before')).toBe(false);
    expect(store.reorderRepo('/repos/a', '/repos/missing', 'after')).toBe(false);
    expect(store.reorderRepo('/repos/missing', '/repos/a', 'before')).toBe(false);
    expect(mockPersistAppConfig).not.toHaveBeenCalled();
  });

  it('reorders repository groups before and after targets', () => {
    const store = useRepoStore();
    store.repoGroups = ['Work', 'Personal', 'OSS'];

    expect(store.reorderRepoGroup('OSS', 'Work', 'before')).toBe(true);
    expect(store.repoGroups).toEqual(['OSS', 'Work', 'Personal']);

    expect(store.reorderRepoGroup('OSS', 'Personal', 'after')).toBe(true);
    expect(store.repoGroups).toEqual(['Work', 'Personal', 'OSS']);
    expect(store.reorderRepoGroup('Work', 'Work', 'before')).toBe(false);

    const savedGroups = JSON.parse(localStorage.getItem('gitbx_repo_groups') || '[]');
    expect(savedGroups).toEqual(['Work', 'Personal', 'OSS']);
  });
});
