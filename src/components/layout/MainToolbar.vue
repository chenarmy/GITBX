<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { useNotificationStore } from '@/stores/notification';
import { useConfirmationStore } from '@/stores/confirmation';
import { useDiffStore } from '@/stores/diff';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  RefreshCw,
  GitBranch,
  GitMerge,
  GitPullRequest,
  GitCommit,
  Archive,
  RotateCcw,
  AlertTriangle,
  Play,
  XCircle,
  Timer,
  FolderGit2,
  ListTodo,
  MoreHorizontal,
  ChevronDown,
} from 'lucide-vue-next';
import { useI18n } from '@/i18n';
import { useChangelistStore } from '@/stores/changelist';

const repoStore = useRepoStore();
const notification = useNotificationStore();
const confirmation = useConfirmationStore();
const diffStore = useDiffStore();
const { t } = useI18n();
const changelistStore = useChangelistStore();

const isFetching = ref(false);
const isPulling = ref(false);
const isPushing = ref(false);
const pullStrategy = ref<'merge' | 'rebase' | 'ff-only'>((localStorage.getItem('gitbx_pull_strategy') as any) || 'merge');
const forceWithLease = ref(false);
const autoFetchEnabled = ref(localStorage.getItem('gitbx_auto_fetch') === 'true');
const moreActionsRef = ref<HTMLElement | null>(null);
const isMoreActionsOpen = ref(false);
let autoFetchTimer: number | undefined;

function scheduleAutoFetch() {
  if (autoFetchTimer) window.clearInterval(autoFetchTimer);
  autoFetchTimer = undefined;
  if (autoFetchEnabled.value) {
    autoFetchTimer = window.setInterval(() => {
      if (!isFetching.value) void repoStore.refreshAllRepoSyncStatuses(true);
    }, 5 * 60 * 1000);
  }
}

function toggleAutoFetch() {
  autoFetchEnabled.value = !autoFetchEnabled.value;
  localStorage.setItem('gitbx_auto_fetch', String(autoFetchEnabled.value));
  scheduleAutoFetch();
  if (autoFetchEnabled.value) void repoStore.refreshAllRepoSyncStatuses(true);
}

function handleWindowClick(event: MouseEvent) {
  if (!moreActionsRef.value?.contains(event.target as Node)) isMoreActionsOpen.value = false;
}

onMounted(() => {
  scheduleAutoFetch();
  void repoStore.refreshAllRepoSyncStatuses(autoFetchEnabled.value);
  window.addEventListener('click', handleWindowClick);
});
onUnmounted(() => {
  if (autoFetchTimer) window.clearInterval(autoFetchTimer);
  window.removeEventListener('click', handleWindowClick);
});

async function handleFetch() {
  isFetching.value = true;
  notification.info(t('Git Fetch'), t('Fetching references from all remotes...'));
  try {
    await repoStore.fetchRemote();
    notification.success(t('Fetch Completed'), t('Remote branches and tags are up to date.'));
  } catch (err: any) {
    notification.error(t('Fetch Failed'), err?.message || t('Remote fetch error'));
  } finally {
    isFetching.value = false;
  }
}

async function handlePull() {
  isPulling.value = true;
  notification.info(t('Git Pull'), t("Pulling latest changes for '{branch}'...", { branch: repoStore.repoInfo?.head_branch || 'main' }));
  try {
    localStorage.setItem('gitbx_pull_strategy', pullStrategy.value);
    await repoStore.pullRemote(pullStrategy.value);
    notification.success(t('Pull Completed'), t('Working branch updated with upstream commits.'));
  } catch (err: any) {
    const firstConflict = repoStore.statusSummary.conflicted_files[0]?.path;
    if (firstConflict) {
      diffStore.selectConflictFile(firstConflict);
      notification.warning(t('Unresolved Conflicts'), t('Resolve every conflicted file before continuing.'));
    } else {
      notification.error(t('Pull Failed'), err?.message || t('Failed to pull from remote'));
    }
  } finally {
    isPulling.value = false;
  }
}

async function handlePush() {
  const existingConflict = repoStore.statusSummary.conflicted_files[0]?.path;
  if (existingConflict) {
    diffStore.selectConflictFile(existingConflict);
    notification.warning(t('Unresolved Conflicts'), t('Resolve every conflicted file before continuing.'));
    return;
  }
  isPushing.value = true;
  notification.info(t('Git Push'), t("Pushing commits on '{branch}' to remote...", { branch: repoStore.repoInfo?.head_branch || 'main' }));
  try {
    if (forceWithLease.value) {
      const approved = await confirmation.confirm({ title: t('Force Push with Lease'), message: t('Rewrite the remote branch only if it has not changed since the last fetch?'), danger: true, confirmText: t('Force Push') });
      if (!approved) return;
    }
    await repoStore.pushRemote(forceWithLease.value);
    notification.success(t('Push Completed'), t('Local commits pushed successfully.'));
  } catch (err: any) {
    // Refresh first: conflicts may have been produced by an external/pending
    // operation just before the push attempt. If so, take the user directly to
    // the editable resolution instead of leaving only an error toast.
    await repoStore.loadRepo().catch(() => undefined);
    const firstConflict = repoStore.statusSummary.conflicted_files[0]?.path;
    if (firstConflict) {
      diffStore.selectConflictFile(firstConflict);
      notification.warning(t('Unresolved Conflicts'), t('Resolve every conflicted file before continuing.'));
    } else {
      notification.error(t('Push Failed'), err?.message || t('Failed to push to remote'));
    }
  } finally {
    isPushing.value = false;
  }
}

async function handleDiscardAll() {
  if (await confirmation.confirm({ title: t('Discard All Changes'), message: t('Discard all uncommitted working tree changes? This cannot be undone.'), danger: true, confirmText: t('Discard All') })) {
    try {
      await repoStore.discardFile();
      notification.warning(t('Changes Discarded'), t('Clean working tree restored.'));
    } catch (err: any) {
      notification.error(t('Discard Failed'), err?.message);
    }
  }
}

function handleOpenBranch() {
  repoStore.isBranchModalOpen = true;
}

function handleOpenMerge() {
  repoStore.targetBranchForAction = '';
  repoStore.isMergeModalOpen = true;
}

function handleOpenRebase() {
  repoStore.targetBranchForAction = '';
  repoStore.isRebaseModalOpen = true;
}

function handleOpenStash() {
  repoStore.isStashModalOpen = true;
}

async function handleCherryPick() {
  if (repoStore.selectedCommit) {
    if (await confirmation.confirm({ title: 'Cherry-pick Commit', message: `Apply ${repoStore.selectedCommit.short_id} ("${repoStore.selectedCommit.summary}") into ${repoStore.repoInfo?.head_branch || 'HEAD'}?`, danger: true })) {
      try {
        const res = await repoStore.cherryPick(repoStore.selectedCommit.id);
        if (res.conflict) {
          notification.warning('Cherry-pick Conflict', 'Conflicts encountered. Please resolve in the staging panel.');
          const firstConflict = repoStore.statusSummary.conflicted_files[0]?.path;
          if (firstConflict) diffStore.selectConflictFile(firstConflict);
        } else {
          notification.success('Cherry-pick Applied', `Commit ${repoStore.selectedCommit.short_id} applied cleanly.`);
        }
      } catch (err: any) {
        notification.error('Cherry-pick Failed', err?.message);
      }
    }
  } else {
    notification.warning('Select Commit', 'Please click a commit node from the graph below to cherry-pick.');
  }
}

async function handleContinueOperation(operation: 'merge' | 'rebase' | 'cherry-pick' | 'revert') {
  if (repoStore.statusSummary.conflicted_files.length > 0) {
    const firstConflict = repoStore.statusSummary.conflicted_files[0]?.path;
    if (firstConflict) diffStore.selectConflictFile(firstConflict);
    notification.warning(t('Unresolved Conflicts'), t('Resolve every conflicted file before continuing.'));
    return;
  }
  try {
    if (operation === 'merge') await repoStore.continueMerge();
    else if (operation === 'rebase') await repoStore.continueRebase();
    else if (operation === 'cherry-pick') await repoStore.continueCherryPick();
    else await repoStore.continueRevert();
    diffStore.clearSelection();
    notification.success(t('Operation Continued'), t('The Git operation completed successfully.'));
  } catch (error: any) {
    notification.error(t('Continue Failed'), error?.message || String(error));
  }
}

async function handleAbortOperation(operation: 'merge' | 'rebase' | 'cherry-pick' | 'revert') {
  const confirmed = await confirmation.confirm({
    title: t('Abort Operation'),
    message: t('Abort the current Git operation and restore the previous working tree?'),
    danger: true,
    confirmText: t('Abort'),
  });
  if (!confirmed) return;
  try {
    if (operation === 'merge') await repoStore.abortMerge();
    else if (operation === 'rebase') await repoStore.abortRebase();
    else if (operation === 'cherry-pick') await repoStore.abortCherryPick();
    else await repoStore.abortRevert();
    diffStore.clearSelection();
    notification.info(t('Operation Aborted'), t('The previous working tree was restored.'));
  } catch (error: any) {
    notification.error(t('Abort Failed'), error?.message || String(error));
  }
}
</script>

<template>
  <div class="dbx-toolbar flex flex-col bg-card border-b border-border">
    <!-- In-progress Operation Banner (Merge / Rebase / Cherry-pick / Revert) -->
    <div
      v-if="repoStore.repoInfo?.is_merging || repoStore.repoInfo?.is_rebasing || repoStore.repoInfo?.is_cherry_picking || repoStore.repoInfo?.is_reverting"
      class="h-8 bg-amber-500/10 border-b border-amber-500/30 px-3 flex items-center justify-between text-xs text-amber-700 dark:text-amber-300 select-none animate-pulse"
    >
      <div class="flex items-center space-x-2">
        <AlertTriangle class="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <span class="font-bold">
          {{ repoStore.repoInfo?.is_merging ? t('Merge in progress') : repoStore.repoInfo?.is_rebasing ? t('Rebase in progress') : repoStore.repoInfo?.is_cherry_picking ? t('Cherry-pick in progress') : t('Revert in progress') }}
        </span>
        <span class="text-[11px] opacity-80">
          ({{ t('Resolve conflicted files in staging panel, then Continue or Abort') }})
        </span>
      </div>

      <div class="flex items-center space-x-2">
        <button
          v-if="repoStore.repoInfo?.is_merging"
          @click="handleAbortOperation('merge')"
          class="px-2.5 py-1 rounded bg-rose-100 hover:bg-rose-200 text-rose-700 dark:bg-rose-950 dark:text-rose-300 flex items-center space-x-1 transition active:scale-95 text-[11px] font-semibold"
        >
          <XCircle class="w-3 h-3" />
          <span>{{ t('Abort Merge') }}</span>
        </button>
        <button
          v-if="repoStore.repoInfo?.is_merging"
          @click="handleContinueOperation('merge')"
          :disabled="repoStore.statusSummary.conflicted_files.length > 0"
          class="px-2.5 py-1 rounded bg-primary hover:bg-primary/90 text-primary-foreground flex items-center space-x-1 font-semibold transition active:scale-95 text-[11px] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Play class="w-3 h-3" />
          <span>{{ t('Continue Merge') }}</span>
        </button>

        <button
          v-if="repoStore.repoInfo?.is_rebasing"
          @click="handleAbortOperation('rebase')"
          class="px-2.5 py-1 rounded bg-rose-100 hover:bg-rose-200 text-rose-700 dark:bg-rose-950 dark:text-rose-300 flex items-center space-x-1 transition active:scale-95 text-[11px] font-semibold"
        >
          <XCircle class="w-3 h-3" />
          <span>{{ t('Abort Rebase') }}</span>
        </button>
        <button
          v-if="repoStore.repoInfo?.is_rebasing"
          @click="handleContinueOperation('rebase')"
          :disabled="repoStore.statusSummary.conflicted_files.length > 0"
          class="px-2.5 py-1 rounded bg-primary hover:bg-primary/90 text-primary-foreground flex items-center space-x-1 font-semibold transition active:scale-95 text-[11px] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Play class="w-3 h-3" />
          <span>{{ t('Continue Rebase') }}</span>
        </button>

        <button
          v-if="repoStore.repoInfo?.is_cherry_picking"
          @click="handleAbortOperation('cherry-pick')"
          class="px-2.5 py-1 rounded bg-rose-100 hover:bg-rose-200 text-rose-700 dark:bg-rose-950 dark:text-rose-300 flex items-center space-x-1 transition active:scale-95 text-[11px] font-semibold"
        >
          <XCircle class="w-3 h-3" />
          <span>{{ t('Abort Cherry-pick') }}</span>
        </button>
        <button
          v-if="repoStore.repoInfo?.is_cherry_picking"
          @click="handleContinueOperation('cherry-pick')"
          :disabled="repoStore.statusSummary.conflicted_files.length > 0"
          class="px-2.5 py-1 rounded bg-primary hover:bg-primary/90 text-primary-foreground flex items-center space-x-1 font-semibold transition active:scale-95 text-[11px] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Play class="w-3 h-3" />
          <span>{{ t('Continue Cherry-pick') }}</span>
        </button>

        <button
          v-if="repoStore.repoInfo?.is_reverting"
          @click="handleAbortOperation('revert')"
          class="px-2.5 py-1 rounded bg-rose-100 hover:bg-rose-200 text-rose-700 dark:bg-rose-950 dark:text-rose-300 flex items-center space-x-1 transition active:scale-95 text-[11px] font-semibold"
        >
          <XCircle class="w-3 h-3" />
          <span>{{ t('Abort Revert') }}</span>
        </button>
        <button
          v-if="repoStore.repoInfo?.is_reverting"
          @click="handleContinueOperation('revert')"
          :disabled="repoStore.statusSummary.conflicted_files.length > 0"
          class="px-2.5 py-1 rounded bg-primary hover:bg-primary/90 text-primary-foreground flex items-center space-x-1 font-semibold transition active:scale-95 text-[11px] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Play class="w-3 h-3" />
          <span>{{ t('Continue Revert') }}</span>
        </button>
      </div>
    </div>

    <!-- Main Toolbar Row -->
    <div class="dbx-toolbar-actions h-10 flex items-center justify-between px-3 text-xs select-none">
      <div class="flex items-center space-x-1 min-w-0">
        <!-- Fetch Button -->
        <button
          @click="handleFetch"
          :disabled="isFetching"
          class="flex items-center space-x-1.5 px-2.5 py-1 rounded-md hover:bg-secondary active:scale-95 text-foreground transition font-medium disabled:opacity-50"
          :title="t('Fetch from all remotes')"
        >
          <RefreshCw class="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" :class="{ 'animate-spin': isFetching }" />
          <span>{{ isFetching ? t('Fetching...') : t('Fetch') }}</span>
        </button>

        <!-- Pull Button -->
        <button
          @click="handlePull"
          :disabled="isPulling"
          class="flex items-center space-x-1.5 px-2.5 py-1 rounded-md hover:bg-secondary active:scale-95 text-foreground transition font-medium disabled:opacity-50"
          :title="t('Pull latest changes from upstream')"
        >
          <ArrowDownCircle class="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" :class="{ 'animate-bounce': isPulling }" />
          <span>{{ isPulling ? t('Pulling...') : t('Pull') }}</span>
        </button>
        <!-- Push Button -->
        <button
          @click="handlePush"
          :disabled="isPushing"
          class="flex items-center space-x-1.5 px-2.5 py-1 rounded-md hover:bg-secondary active:scale-95 text-foreground transition font-medium disabled:opacity-50"
          :title="t('Push local commits to remote')"
        >
          <ArrowUpCircle class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" :class="{ 'animate-bounce': isPushing }" />
          <span>{{ isPushing ? t('Pushing...') : t('Push') }}</span>
        </button>
        <div class="h-4 w-[1px] bg-border mx-1"></div>

        <!-- Branch Button -->
        <button
          @click="handleOpenBranch"
          class="flex items-center space-x-1.5 px-2.5 py-1 rounded-md hover:bg-secondary active:scale-95 text-foreground transition font-medium"
          :title="t('Create new branch')"
        >
          <GitBranch class="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
          <span>{{ t('Branch') }}</span>
        </button>

        <!-- Merge Button -->
        <button
          @click="handleOpenMerge"
          class="flex items-center space-x-1.5 px-2.5 py-1 rounded-md hover:bg-secondary active:scale-95 text-foreground transition font-medium"
          :title="t('Merge branch into current branch')"
        >
          <GitMerge class="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span>{{ t('Merge') }}</span>
        </button>

        <div class="h-4 w-[1px] bg-border mx-1"></div>

        <!-- Stash Button -->
        <button
          @click="handleOpenStash"
          class="flex items-center space-x-1.5 px-2.5 py-1 rounded-md hover:bg-secondary active:scale-95 text-foreground transition font-medium"
          :title="t('Save uncommitted changes to stash')"
        >
          <Archive class="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
          <span>{{ t('Stash') }}</span>
        </button>

        <div ref="moreActionsRef" class="relative">
          <button
            class="flex items-center space-x-1 px-2.5 py-1 rounded-md hover:bg-secondary active:scale-95 text-muted-foreground hover:text-foreground transition font-medium"
            :class="{ 'bg-secondary text-foreground': isMoreActionsOpen }"
            :title="t('More actions')"
            @click.stop="isMoreActionsOpen = !isMoreActionsOpen"
          >
            <MoreHorizontal class="w-3.5 h-3.5" />
            <span>{{ t('More actions') }}</span>
            <ChevronDown class="w-3 h-3" />
          </button>

          <div
            v-if="isMoreActionsOpen"
            class="absolute left-0 top-full mt-1 w-64 bg-popover text-popover-foreground border border-border rounded-md py-1 z-50"
          >
            <div class="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {{ t('Git Options') }}
            </div>
            <label class="flex items-center justify-between gap-3 px-2.5 py-1.5 hover:bg-accent cursor-pointer">
              <span>{{ t('Pull Strategy') }}</span>
              <select v-model="pullStrategy" class="bg-background border border-border rounded px-1.5 py-1 text-[10px]" @click.stop>
                <option value="merge">merge</option>
                <option value="rebase">rebase</option>
                <option value="ff-only">ff-only</option>
              </select>
            </label>
            <label class="flex items-center justify-between gap-3 px-2.5 py-1.5 hover:bg-accent cursor-pointer">
              <span>{{ t('Force Push with Lease') }}</span>
              <input v-model="forceWithLease" type="checkbox" />
            </label>

            <div class="my-1 border-t border-border"></div>
            <button class="toolbar-menu-item" @click="isMoreActionsOpen = false; handleOpenRebase()">
              <GitPullRequest class="w-3.5 h-3.5 text-sky-500" />
              <span>{{ t('Rebase') }}</span>
            </button>
            <button class="toolbar-menu-item" @click="isMoreActionsOpen = false; handleCherryPick()">
              <GitCommit class="w-3.5 h-3.5 text-indigo-500" />
              <span>{{ t('Cherry-pick') }}</span>
            </button>
            <button class="toolbar-menu-item" @click="isMoreActionsOpen = false; repoStore.isWorktreeManagerOpen = true">
              <FolderGit2 class="w-3.5 h-3.5 text-teal-500" />
              <span>{{ t('Worktrees') }}</span>
            </button>
            <button class="toolbar-menu-item" @click="isMoreActionsOpen = false; changelistStore.isManagerOpen = true">
              <ListTodo class="w-3.5 h-3.5 text-violet-500" />
              <span>{{ t('Changelists') }}</span>
            </button>
            <button class="toolbar-menu-item" @click="isMoreActionsOpen = false; repoStore.isPullRequestOpen = true">
              <GitPullRequest class="w-3.5 h-3.5 text-fuchsia-500" />
              <span>{{ t('PR/MR') }}</span>
            </button>

            <div class="my-1 border-t border-border"></div>
            <button
              class="toolbar-menu-item text-rose-600 dark:text-rose-400 disabled:opacity-40 disabled:cursor-not-allowed"
              :disabled="repoStore.statusSummary.total_changes === 0 || repoStore.repoInfo?.is_merging || repoStore.repoInfo?.is_rebasing || repoStore.repoInfo?.is_cherry_picking"
              @click="isMoreActionsOpen = false; handleDiscardAll()"
            >
              <RotateCcw class="w-3.5 h-3.5" />
              <span>{{ t('Discard All') }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Active Branch Badge -->
      <div class="flex items-center space-x-2">
        <button class="flex items-center gap-1 px-2 py-0.5 rounded border border-border hover:bg-secondary text-[10px]" :title="t('Incoming and Outgoing Commits')" @click="repoStore.isSyncStatusOpen = true">
          <span class="text-sky-500">↓{{ repoStore.syncStatus.incoming.length }}</span><span class="text-emerald-500">↑{{ repoStore.syncStatus.outgoing.length }}</span>
        </button>
        <button class="p-1 rounded hover:bg-secondary" :class="autoFetchEnabled ? 'text-primary' : 'text-muted-foreground'" :title="t(autoFetchEnabled ? 'Background Fetch Enabled' : 'Background Fetch Disabled')" @click="toggleAutoFetch"><Timer class="w-3.5 h-3.5" /></button>
        <div
          @click="handleOpenBranch"
          class="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-md bg-secondary/80 hover:bg-secondary border border-border font-mono text-[11px] cursor-pointer transition active:scale-95 shadow-sm"
          :title="t('Current checked out branch')"
        >
          <GitBranch class="w-3.5 h-3.5 text-primary" />
          <span class="font-bold text-foreground">{{ repoStore.repoInfo?.head_branch || 'main' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toolbar-menu-item {
  align-items: center;
  display: flex;
  gap: 0.5rem;
  min-height: 28px;
  padding: 0.35rem 0.625rem;
  text-align: left;
  width: 100%;
}

.toolbar-menu-item:hover:not(:disabled) {
  background: hsl(var(--accent));
}
</style>
