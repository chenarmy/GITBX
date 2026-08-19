<script setup lang="ts">
import { ref } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { useNotificationStore } from '@/stores/notification';
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
} from 'lucide-vue-next';

const repoStore = useRepoStore();
const notification = useNotificationStore();

const isFetching = ref(false);
const isPulling = ref(false);
const isPushing = ref(false);

async function handleFetch() {
  isFetching.value = true;
  notification.info('Git Fetch', 'Fetching references from all remotes...');
  try {
    await repoStore.fetchRemote();
    notification.success('Fetch Completed', 'Remote branches and tags are up to date.');
  } catch (err: any) {
    notification.error('Fetch Failed', err?.message || 'Remote fetch error');
  } finally {
    isFetching.value = false;
  }
}

async function handlePull() {
  isPulling.value = true;
  notification.info('Git Pull', `Pulling latest changes for '${repoStore.repoInfo?.head_branch || 'main'}'...`);
  try {
    await repoStore.pullRemote();
    notification.success('Pull Completed', 'Working branch updated with upstream commits.');
  } catch (err: any) {
    notification.error('Pull Failed', err?.message || 'Failed to pull from remote');
  } finally {
    isPulling.value = false;
  }
}

async function handlePush() {
  isPushing.value = true;
  notification.info('Git Push', `Pushing commits on '${repoStore.repoInfo?.head_branch || 'main'}' to remote...`);
  try {
    await repoStore.pushRemote();
    notification.success('Push Completed', 'Local commits pushed successfully.');
  } catch (err: any) {
    notification.error('Push Failed', err?.message || 'Failed to push to remote');
  } finally {
    isPushing.value = false;
  }
}

async function handleDiscardAll() {
  if (confirm('Discard all uncommitted working tree changes? This cannot be undone.')) {
    try {
      await repoStore.discardFile();
      notification.warning('Changes Discarded', 'Clean working tree restored.');
    } catch (err: any) {
      notification.error('Discard Failed', err?.message);
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
    if (confirm(`Cherry-pick commit ${repoStore.selectedCommit.short_id} ("${repoStore.selectedCommit.summary}") into ${repoStore.repoInfo?.head_branch || 'HEAD'}?`)) {
      try {
        const res = await repoStore.cherryPick(repoStore.selectedCommit.id);
        if (res.conflict) {
          notification.warning('Cherry-pick Conflict', 'Conflicts encountered. Please resolve in the staging panel.');
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
</script>

<template>
  <div class="flex flex-col bg-card border-b border-border">
    <!-- In-progress Operation Banner (Merge / Rebase / Cherry-pick) -->
    <div
      v-if="repoStore.repoInfo?.is_merging || repoStore.repoInfo?.is_rebasing || repoStore.repoInfo?.is_cherry_picking"
      class="h-8 bg-amber-500/10 border-b border-amber-500/30 px-3 flex items-center justify-between text-xs text-amber-700 dark:text-amber-300 select-none animate-pulse"
    >
      <div class="flex items-center space-x-2">
        <AlertTriangle class="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <span class="font-bold">
          {{ repoStore.repoInfo?.is_merging ? 'Merge in progress' : repoStore.repoInfo?.is_rebasing ? 'Rebase in progress' : 'Cherry-pick in progress' }}
        </span>
        <span class="text-[11px] opacity-80">
          (Resolve conflicted files in staging panel, then Continue or Abort)
        </span>
      </div>

      <div class="flex items-center space-x-2">
        <button
          v-if="repoStore.repoInfo?.is_merging"
          @click="repoStore.abortMerge()"
          class="px-2.5 py-1 rounded bg-rose-100 hover:bg-rose-200 text-rose-700 dark:bg-rose-950 dark:text-rose-300 flex items-center space-x-1 transition active:scale-95 text-[11px] font-semibold"
        >
          <XCircle class="w-3 h-3" />
          <span>Abort Merge</span>
        </button>

        <button
          v-if="repoStore.repoInfo?.is_rebasing"
          @click="repoStore.abortRebase()"
          class="px-2.5 py-1 rounded bg-rose-100 hover:bg-rose-200 text-rose-700 dark:bg-rose-950 dark:text-rose-300 flex items-center space-x-1 transition active:scale-95 text-[11px] font-semibold"
        >
          <XCircle class="w-3 h-3" />
          <span>Abort Rebase</span>
        </button>
        <button
          v-if="repoStore.repoInfo?.is_rebasing"
          @click="repoStore.continueRebase()"
          class="px-2.5 py-1 rounded bg-primary hover:bg-primary/90 text-primary-foreground flex items-center space-x-1 font-semibold transition active:scale-95 text-[11px]"
        >
          <Play class="w-3 h-3" />
          <span>Continue Rebase</span>
        </button>

        <button
          v-if="repoStore.repoInfo?.is_cherry_picking"
          @click="repoStore.abortCherryPick()"
          class="px-2.5 py-1 rounded bg-rose-100 hover:bg-rose-200 text-rose-700 dark:bg-rose-950 dark:text-rose-300 flex items-center space-x-1 transition active:scale-95 text-[11px] font-semibold"
        >
          <XCircle class="w-3 h-3" />
          <span>Abort Cherry-pick</span>
        </button>
        <button
          v-if="repoStore.repoInfo?.is_cherry_picking"
          @click="repoStore.continueCherryPick()"
          class="px-2.5 py-1 rounded bg-primary hover:bg-primary/90 text-primary-foreground flex items-center space-x-1 font-semibold transition active:scale-95 text-[11px]"
        >
          <Play class="w-3 h-3" />
          <span>Continue Cherry-pick</span>
        </button>
      </div>
    </div>

    <!-- Main Toolbar Row -->
    <div class="h-10 flex items-center justify-between px-3 text-xs select-none">
      <div class="flex items-center space-x-1">
        <!-- Fetch Button -->
        <button
          @click="handleFetch"
          :disabled="isFetching"
          class="flex items-center space-x-1.5 px-2.5 py-1 rounded-md hover:bg-secondary active:scale-95 text-foreground transition font-medium disabled:opacity-50"
          title="Fetch from all remotes"
        >
          <RefreshCw class="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" :class="{ 'animate-spin': isFetching }" />
          <span>{{ isFetching ? 'Fetching...' : 'Fetch' }}</span>
        </button>

        <!-- Pull Button -->
        <button
          @click="handlePull"
          :disabled="isPulling"
          class="flex items-center space-x-1.5 px-2.5 py-1 rounded-md hover:bg-secondary active:scale-95 text-foreground transition font-medium disabled:opacity-50"
          title="Pull latest changes from upstream"
        >
          <ArrowDownCircle class="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" :class="{ 'animate-bounce': isPulling }" />
          <span>{{ isPulling ? 'Pulling...' : 'Pull' }}</span>
        </button>

        <!-- Push Button -->
        <button
          @click="handlePush"
          :disabled="isPushing"
          class="flex items-center space-x-1.5 px-2.5 py-1 rounded-md hover:bg-secondary active:scale-95 text-foreground transition font-medium disabled:opacity-50"
          title="Push local commits to remote"
        >
          <ArrowUpCircle class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" :class="{ 'animate-bounce': isPushing }" />
          <span>{{ isPushing ? 'Pushing...' : 'Push' }}</span>
        </button>

        <div class="h-4 w-[1px] bg-border mx-1"></div>

        <!-- Branch Button -->
        <button
          @click="handleOpenBranch"
          class="flex items-center space-x-1.5 px-2.5 py-1 rounded-md hover:bg-secondary active:scale-95 text-foreground transition font-medium"
          title="Create new branch"
        >
          <GitBranch class="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
          <span>Branch</span>
        </button>

        <!-- Merge Button -->
        <button
          @click="handleOpenMerge"
          class="flex items-center space-x-1.5 px-2.5 py-1 rounded-md hover:bg-secondary active:scale-95 text-foreground transition font-medium"
          title="Merge branch into current branch"
        >
          <GitMerge class="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span>Merge</span>
        </button>

        <!-- Rebase Button -->
        <button
          @click="handleOpenRebase"
          class="flex items-center space-x-1.5 px-2.5 py-1 rounded-md hover:bg-secondary active:scale-95 text-foreground transition font-medium"
          title="Rebase current branch onto another branch"
        >
          <GitPullRequest class="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
          <span>Rebase</span>
        </button>

        <!-- Cherry-pick Button -->
        <button
          @click="handleCherryPick"
          class="flex items-center space-x-1.5 px-2.5 py-1 rounded-md hover:bg-secondary active:scale-95 text-foreground transition font-medium"
          title="Cherry-pick selected commit into current branch"
        >
          <GitCommit class="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          <span>Cherry-pick</span>
        </button>

        <div class="h-4 w-[1px] bg-border mx-1"></div>

        <!-- Stash Button -->
        <button
          @click="handleOpenStash"
          class="flex items-center space-x-1.5 px-2.5 py-1 rounded-md hover:bg-secondary active:scale-95 text-foreground transition font-medium"
          title="Save uncommitted changes to stash"
        >
          <Archive class="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
          <span>Stash</span>
        </button>

        <!-- Discard All Button -->
        <button
          @click="handleDiscardAll"
          :disabled="repoStore.statusSummary.total_changes === 0"
          class="flex items-center space-x-1.5 px-2.5 py-1 rounded-md hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40 dark:hover:text-rose-300 active:scale-95 text-foreground transition font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          title="Discard all uncommitted changes in working tree"
        >
          <RotateCcw class="w-3.5 h-3.5 text-rose-500" />
          <span>Discard All</span>
        </button>
      </div>

      <!-- Active Branch Badge -->
      <div class="flex items-center space-x-2">
        <div
          @click="handleOpenBranch"
          class="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-md bg-secondary/80 hover:bg-secondary border border-border font-mono text-[11px] cursor-pointer transition active:scale-95 shadow-sm"
          title="Current checked out branch"
        >
          <GitBranch class="w-3.5 h-3.5 text-primary" />
          <span class="font-bold text-foreground">{{ repoStore.repoInfo?.head_branch || 'main' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
