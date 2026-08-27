<script setup lang="ts">
import { ref, watch } from 'vue';
import { FolderGit2, X, Plus, Trash2, Lock, Unlock, RefreshCw, FolderOpen } from 'lucide-vue-next';
import { useRepoStore } from '@/stores/repo';
import { useConfirmationStore } from '@/stores/confirmation';
import { useNotificationStore } from '@/stores/notification';
import { useGitApi, formatGitError } from '@/composables/useGitApi';
import { useI18n } from '@/i18n';
import type { WorktreeInfo } from '@/types/git';

const repoStore = useRepoStore();
const confirmation = useConfirmationStore();
const notification = useNotificationStore();
const gitApi = useGitApi();
const { t } = useI18n();
const worktrees = ref<WorktreeInfo[]>([]);
const destination = ref('');
const branch = ref('');
const loading = ref(false);
const errorMessage = ref('');

async function refresh() {
  if (!repoStore.activeRepoPath) return;
  loading.value = true; errorMessage.value = '';
  try { worktrees.value = await gitApi.listWorktrees(repoStore.activeRepoPath); }
  catch (error) { errorMessage.value = formatGitError(error); }
  finally { loading.value = false; }
}

watch(() => repoStore.isWorktreeManagerOpen, (open) => {
  if (open) { branch.value = repoStore.branches.find((item) => !item.is_head && !item.is_remote)?.name || ''; void refresh(); }
});

async function addWorktree() {
  if (!destination.value.trim() || !branch.value) return;
  loading.value = true;
  try { await gitApi.createWorktree(repoStore.activeRepoPath, destination.value.trim(), branch.value); destination.value = ''; await refresh(); notification.success(t('Worktree created'), branch.value); }
  catch (error) { errorMessage.value = formatGitError(error); loading.value = false; }
}

async function remove(item: WorktreeInfo) {
  const approved = await confirmation.confirm({ title: t('Remove Worktree'), message: t('Remove worktree at {path}? Uncommitted changes will prevent removal.', { path: item.path }), danger: true, confirmText: t('Remove') });
  if (!approved) return;
  try { await gitApi.removeWorktree(repoStore.activeRepoPath, item.path, false); await refresh(); }
  catch (error) { errorMessage.value = formatGitError(error); }
}

async function toggleLock(item: WorktreeInfo) {
  try { await gitApi.setWorktreeLocked(repoStore.activeRepoPath, item.path, !item.is_locked, item.is_locked ? undefined : t('Locked by GITBX')); await refresh(); }
  catch (error) { errorMessage.value = formatGitError(error); }
}

async function prune() { try { await gitApi.pruneWorktrees(repoStore.activeRepoPath); await refresh(); } catch (error) { errorMessage.value = formatGitError(error); } }
</script>

<template>
  <div v-if="repoStore.isWorktreeManagerOpen" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="w-full max-w-5xl h-[70vh] bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs">
      <div class="h-11 px-4 flex items-center justify-between border-b border-border bg-muted/50"><div class="flex gap-2 items-center"><FolderGit2 class="w-4 h-4 text-teal-500" /><span class="font-bold text-sm">{{ t('Worktree Manager') }}</span></div><button class="p-1 rounded hover:bg-accent" @click="repoStore.isWorktreeManagerOpen = false"><X class="w-4 h-4" /></button></div>
      <div class="p-3 border-b border-border grid grid-cols-[1fr_220px_auto_auto] gap-2">
        <input v-model="destination" class="bg-background border border-border rounded px-3 py-2 font-mono" :placeholder="t('Destination path')" />
        <select v-model="branch" class="bg-background border border-border rounded px-2"><option v-for="item in repoStore.branches.filter(item => !item.is_remote && !item.is_head)" :key="item.name" :value="item.name">{{ item.name }}</option></select>
        <button class="px-3 rounded bg-primary text-primary-foreground flex gap-1 items-center disabled:opacity-40" :disabled="!destination.trim() || !branch" @click="addWorktree"><Plus class="w-3.5 h-3.5" />{{ t('Add Worktree') }}</button>
        <button class="px-3 rounded border border-border hover:bg-accent" @click="prune">{{ t('Prune') }}</button>
      </div>
      <div v-if="errorMessage" class="m-3 p-2 rounded bg-rose-500/10 text-rose-500 border border-rose-500/20">{{ errorMessage }}</div>
      <div class="grid grid-cols-[1fr_180px_100px_170px] px-3 py-2 bg-muted/40 uppercase text-[10px] font-bold text-muted-foreground"><span>{{ t('Path') }}</span><span>{{ t('Branch') }}</span><span>{{ t('HEAD') }}</span><span>{{ t('Actions') }}</span></div>
      <div class="flex-1 overflow-auto divide-y divide-border">
        <div v-for="item in worktrees" :key="item.path" class="grid grid-cols-[1fr_180px_100px_170px] px-3 py-2 items-center gap-2">
          <div class="min-w-0"><div class="font-mono truncate">{{ item.path }}</div><div class="text-[10px] text-muted-foreground">{{ item.is_main ? t('Main Worktree') : item.is_locked ? `${t('Locked')}: ${item.lock_reason || ''}` : item.is_prunable ? t('Prunable') : '' }}</div></div>
          <span class="truncate">{{ item.branch || t('Detached HEAD') }}</span><span class="font-mono text-primary">{{ item.head.slice(0, 8) }}</span>
          <div class="flex gap-1"><button class="p-1.5 rounded hover:bg-accent" :title="t('Open in File Manager')" @click="gitApi.openFileManager(item.path)"><FolderOpen class="w-3.5 h-3.5" /></button><button v-if="!item.is_main" class="p-1.5 rounded hover:bg-accent" :title="t(item.is_locked ? 'Unlock' : 'Lock')" @click="toggleLock(item)"><Unlock v-if="item.is_locked" class="w-3.5 h-3.5" /><Lock v-else class="w-3.5 h-3.5" /></button><button v-if="!item.is_main" class="p-1.5 rounded hover:bg-rose-500/10 text-rose-500" :title="t('Remove')" @click="remove(item)"><Trash2 class="w-3.5 h-3.5" /></button></div>
        </div>
        <div v-if="loading" class="p-8 text-center text-muted-foreground"><RefreshCw class="w-4 h-4 animate-spin inline mr-2" />{{ t('Loading...') }}</div>
      </div>
    </div>
  </div>
</template>
