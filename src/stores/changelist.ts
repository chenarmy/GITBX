import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useRepoStore } from '@/stores/repo';

export interface ChangeList { id: string; name: string; color: string }
const STORAGE_KEY = 'gitbx_changelists';
const DEFAULT_LIST: ChangeList = { id: 'default', name: 'Default', color: '#64748b' };

function loadState(): { lists: ChangeList[]; assignments: Record<string, Record<string, string>> } {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { lists: Array.isArray(parsed.lists) && parsed.lists.length ? parsed.lists : [DEFAULT_LIST], assignments: parsed.assignments || {} };
  } catch { return { lists: [DEFAULT_LIST], assignments: {} }; }
}

export const useChangelistStore = defineStore('changelist', () => {
  const repoStore = useRepoStore();
  const initial = loadState();
  const lists = ref<ChangeList[]>(initial.lists);
  const assignments = ref<Record<string, Record<string, string>>>(initial.assignments);
  const isManagerOpen = ref(false);
  const activeAssignments = computed(() => assignments.value[repoStore.activeRepoPath] || {});
  watch([lists, assignments], () => localStorage.setItem(STORAGE_KEY, JSON.stringify({ lists: lists.value, assignments: assignments.value })), { deep: true });

  function create(name: string) {
    const clean = name.trim(); if (!clean) return;
    lists.value.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: clean, color: ['#3b82f6', '#a855f7', '#f59e0b', '#10b981'][lists.value.length % 4] });
  }
  function remove(id: string) {
    if (id === 'default') return;
    lists.value = lists.value.filter((list) => list.id !== id);
    for (const repo of Object.values(assignments.value)) for (const path of Object.keys(repo)) if (repo[path] === id) repo[path] = 'default';
  }
  function assign(filePath: string, listId: string) {
    assignments.value[repoStore.activeRepoPath] ||= {};
    assignments.value[repoStore.activeRepoPath][filePath] = listId;
  }
  function listFor(filePath: string) { const id = activeAssignments.value[filePath] || 'default'; return lists.value.find((list) => list.id === id) || DEFAULT_LIST; }
  return { lists, assignments, activeAssignments, isManagerOpen, create, remove, assign, listFor };
});
