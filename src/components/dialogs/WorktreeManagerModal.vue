<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { FolderGit2, Plus, Trash2, Lock, Unlock, RefreshCw, FolderOpen, ArrowRightCircle } from 'lucide-vue-next';
import ArcoModal from '@/components/ui/ArcoModal.vue';
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
const availableBranches = computed(() => {
  const checkedOut = new Set(worktrees.value.map((item) => item.branch).filter(Boolean));
  return repoStore.branches.filter(
    (item) => !item.is_remote && !item.is_head && !checkedOut.has(item.name),
  );
});

async function refresh() {
  if (!repoStore.activeRepoPath) return;
  loading.value = true; errorMessage.value = '';
  try {
    worktrees.value = await gitApi.listWorktrees(repoStore.activeRepoPath);
    if (!availableBranches.value.some((item) => item.name === branch.value)) {
      branch.value = availableBranches.value[0]?.name || '';
    }
  }
  catch (error) { errorMessage.value = formatGitError(error); }
  finally { loading.value = false; }
}

watch(() => repoStore.isWorktreeManagerOpen, (open) => {
  if (open) { branch.value = ''; void refresh(); }
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
  try { await gitApi.removeWorktree(repoStore.activeRepoPath, item.path, false); await refresh(); notification.success(t('Worktree removed'), item.path); }
  catch (error) { errorMessage.value = formatGitError(error); }
}

async function toggleLock(item: WorktreeInfo) {
  try { await gitApi.setWorktreeLocked(repoStore.activeRepoPath, item.path, !item.is_locked, item.is_locked ? undefined : t('Locked by GITBX')); await refresh(); notification.success(t(item.is_locked ? 'Worktree unlocked' : 'Worktree locked'), item.path); }
  catch (error) { errorMessage.value = formatGitError(error); }
}

async function prune() { try { await gitApi.pruneWorktrees(repoStore.activeRepoPath); await refresh(); notification.success(t('Worktrees pruned')); } catch (error) { errorMessage.value = formatGitError(error); } }

async function openWorktree(item: WorktreeInfo) {
  try { await gitApi.openFileManager(item.path); }
  catch (error) { errorMessage.value = formatGitError(error); }
}

async function openWorktreeInWorkspace(item: WorktreeInfo) {
  try {
    await repoStore.addRepo(item.path);
    repoStore.closeModal('worktreeManager');
  } catch (error) {
    errorMessage.value = formatGitError(error);
  }
}
</script>

<template>
  <ArcoModal
    v-if="repoStore.isWorktreeManagerOpen"
    :title="t('Worktree Manager')"
    max-width-class="max-w-5xl"
    height-class="h-[70vh]"
    icon-bg-class="bg-teal-500/10 text-teal-500"
    raw-body
    @close="repoStore.closeModal('worktreeManager')"
  >
    <template #icon>
      <FolderGit2 class="w-4 h-4" aria-hidden="true" />
    </template>

    <template #below-header>
      <div class="px-5 py-3 border-b border-border/80 bg-[hsl(var(--arco-fill-1))] grid grid-cols-[1fr_220px_auto_auto] gap-2 shrink-0">
        <input v-model="destination" class="arco-input font-mono" :placeholder="t('Destination path')" />
        <select v-model="branch" class="arco-select">
          <option v-for="item in availableBranches" :key="item.name" :value="item.name">{{ item.name }}</option>
        </select>
        <button
          type="button"
          class="arco-btn arco-btn-primary"
          :disabled="!destination.trim() || !branch"
          @click="addWorktree"
        >
          <Plus class="w-3.5 h-3.5" />{{ t('Add Worktree') }}
        </button>
        <button type="button" class="arco-btn arco-btn-outline" @click="prune">{{ t('Prune') }}</button>
      </div>
    </template>

    <div v-if="errorMessage" class="arco-alert arco-alert-danger m-4 shrink-0">{{ errorMessage }}</div>

    <div class="grid grid-cols-[1fr_180px_100px_170px] px-4 py-2 bg-[hsl(var(--arco-fill-2))] border-b border-border/80 uppercase text-[10px] font-semibold tracking-wider text-muted-foreground shrink-0">
      <span>{{ t('Path') }}</span>
      <span>{{ t('Branch') }}</span>
      <span>{{ t('HEAD') }}</span>
      <span>{{ t('Actions') }}</span>
    </div>

    <div class="flex-1 overflow-auto divide-y divide-border/70">
      <div
        v-for="item in worktrees"
        :key="item.path"
        class="grid grid-cols-[1fr_180px_100px_170px] px-4 py-2.5 items-center gap-2 hover:bg-accent/40 transition-colors"
      >
        <div class="min-w-0">
          <div class="font-mono text-foreground truncate">{{ item.path }}</div>
          <div class="text-[10px] text-muted-foreground mt-0.5">
            {{ item.is_main ? t('Main Worktree') : item.is_locked ? `${t('Locked')}: ${item.lock_reason || ''}` : item.is_prunable ? t('Prunable') : '' }}
          </div>
        </div>
        <span class="truncate text-foreground">{{ item.branch || t('Detached HEAD') }}</span>
        <span class="font-mono text-primary">{{ item.head.slice(0, 8) }}</span>
        <div class="flex gap-1">
          <button
            type="button"
            class="arco-icon-btn-sm text-primary hover:bg-primary/10"
            :title="t('Open Worktree in Workspace')"
            @click="openWorktreeInWorkspace(item)"
          >
            <ArrowRightCircle class="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            class="arco-icon-btn-sm"
            :title="t('Open in File Manager')"
            @click="openWorktree(item)"
          >
            <FolderOpen class="w-3.5 h-3.5" />
          </button>
          <button
            v-if="!item.is_main"
            type="button"
            class="arco-icon-btn-sm"
            :title="t(item.is_locked ? 'Unlock' : 'Lock')"
            @click="toggleLock(item)"
          >
            <Unlock v-if="item.is_locked" class="w-3.5 h-3.5 text-[hsl(var(--arco-warning))]" />
            <Lock v-else class="w-3.5 h-3.5" />
          </button>
          <button
            v-if="!item.is_main"
            type="button"
            class="arco-icon-btn-sm text-[hsl(var(--arco-danger))] hover:bg-[hsl(var(--arco-danger)/0.12)]"
            :title="t('Remove')"
            @click="remove(item)"
          >
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div v-if="loading" class="p-8 text-center text-muted-foreground">
        <RefreshCw class="w-4 h-4 animate-spin inline mr-2 text-primary" />{{ t('Loading...') }}
      </div>
    </div>
  </ArcoModal>
</template>
