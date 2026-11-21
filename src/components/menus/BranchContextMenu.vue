<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { formatGitError, useGitApi } from '@/composables/useGitApi';
import { useNotificationStore } from '@/stores/notification';
import { useConfirmationStore } from '@/stores/confirmation';
import { useI18n } from '@/i18n';
import type { BranchItem } from '@/types/git';
import { usePushRecovery } from '@/composables/usePushRecovery';
import { useBranchCheckout } from '@/composables/useBranchCheckout';
import { useContextMenuPosition } from '@/composables/useContextMenuPosition';
import {
  CheckCircle2,
  GitBranch,
  GitCompareArrows,
  FileDiff,
  FolderGit2,
  FolderTree,
  ArrowDownCircle,
  ArrowUpCircle,
  Edit3,
  Trash2,
  GitMerge,
  GitPullRequest,
  Globe,
} from 'lucide-vue-next';

const props = withDefaults(
  defineProps<{
    branch: BranchItem;
    x?: number;
    y?: number;
  }>(),
  {
    x: 0,
    y: 0,
  }
);

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const repoStore = useRepoStore();
const gitApi = useGitApi();
const notification = useNotificationStore();
const confirmation = useConfirmationStore();
const { t } = useI18n();
const { pushWithRecovery } = usePushRecovery();
const { checkoutBranch } = useBranchCheckout();

const isCurrentBranch = computed(() => {
  return props.branch.is_head || props.branch.name === repoStore.repoInfo?.head_branch;
});

const isRemoteBranch = computed(() => {
  return props.branch.is_remote;
});

const trackedBranchName = computed(() => {
  if (props.branch.upstream_name) {
    return props.branch.upstream_name.replace(/^refs\/remotes\//, '');
  }
  return `origin/${props.branch.name}`;
});

const menuRef = ref<HTMLElement | null>(null);
const { menuStyle } = useContextMenuPosition(
  menuRef,
  () => ({ x: props.x, y: props.y }),
  { fallbackWidth: 288, fallbackHeight: 450 },
);

async function handleCheckout() {
  try {
    await checkoutBranch(props.branch.name);
  } finally {
    emit('close');
  }
}

function handleNewBranchFrom() {
  repoStore.selectedCommit = repoStore.commitNodes.find(c => c.id === props.branch.target_commit_id) || null;
  repoStore.targetBranchForAction = props.branch.name;
  repoStore.openModal('branch');
  emit('close');
}

async function handleCheckoutAndRebase() {
  const previousBranch = repoStore.repoInfo?.head_branch;
  try {
    if (!previousBranch) throw new Error('The current branch could not be determined.');
    if (!await checkoutBranch(props.branch.name)) return;
    await repoStore.rebase(previousBranch);
  } catch (error) {
    notification.error(t('Operation Failed'), formatGitError(error));
  } finally {
    emit('close');
  }
}

async function handleCheckoutAndUpdate() {
  try {
    if (!await checkoutBranch(props.branch.name)) return;
    await repoStore.pullRemote();
  } catch (error) {
    notification.error(t('Checkout Failed'), formatGitError(error));
  } finally {
    emit('close');
  }
}

async function handleCompare() {
  try {
    const files = await repoStore.compareBranch(props.branch);
    const base = repoStore.repoInfo?.head_branch || 'HEAD';
    notification.info(
      t('Branch comparison'),
      `${base} → ${props.branch.name} · ${files.length} ${t('files')}`,
    );
  } catch (error) {
    notification.error(t('Operation Failed'), formatGitError(error, 'Failed to compare branches'));
  } finally {
    emit('close');
  }
}

function handleShowDiffWithWorkingTree() {
  void repoStore.selectCommit(null);
  notification.info(
    t('Working Tree'),
    repoStore.statusSummary.total_changes > 0
      ? t('{count} uncommitted changes', { count: repoStore.statusSummary.total_changes })
      : t('Working tree clean'),
  );
  emit('close');
}

async function handleNewWorktree() {
  try {
    const worktrees = await gitApi.listWorktrees(repoStore.activeRepoPath);
    const localBranchName = props.branch.is_remote
      ? props.branch.name.split('/').slice(1).join('/')
      : props.branch.name;
    const existing = worktrees.find((item) => item.branch === localBranchName);
    if (existing) {
      notification.info(t('Worktrees'), existing.path);
      repoStore.openModal('worktreeManager');
      return;
    }
    const sanitizedBranch = props.branch.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const cleanRepoPath = repoStore.activeRepoPath.replace(/[\\/]+$/, '');
    const sep = cleanRepoPath.includes('\\') ? '\\' : '/';
    const lastSep = Math.max(cleanRepoPath.lastIndexOf('\\'), cleanRepoPath.lastIndexOf('/'));
    const parentDir = lastSep > 0 ? cleanRepoPath.slice(0, lastSep) : cleanRepoPath;
    const repoName = lastSep >= 0 ? cleanRepoPath.slice(lastSep + 1) : 'repo';
    const defaultDest = `${parentDir}${sep}${repoName}-worktrees${sep}${sanitizedBranch}`;
    const destPath = await confirmation.prompt({
      title: t('Create Worktree'),
      message: t("Choose a destination directory for '{branch}'.", { branch: props.branch.name }),
      inputLabel: t('Destination path'),
      defaultValue: defaultDest,
    });
    if (destPath && destPath.trim()) {
      try {
        await gitApi.createWorktree(repoStore.activeRepoPath, destPath.trim(), props.branch.name);
        await repoStore.loadRepo(repoStore.activeRepoPath);
        notification.success(t('Worktree created'), destPath.trim());
        repoStore.openModal('worktreeManager');
      } catch (err: unknown) {
        notification.error(t('Worktree creation failed'), formatGitError(err));
      }
    }
  } finally {
    emit('close');
  }
}

function handleRebaseOnto() {
  repoStore.targetBranchForAction = props.branch.name;
  repoStore.openModal('rebase');
  emit('close');
}

function handleMergeInto() {
  const currentBranch = repoStore.repoInfo?.head_branch;
  const targetCommit = repoStore.commitNodes.find((commit) => commit.id === props.branch.target_commit_id);
  if (
    currentBranch
    && targetCommit?.containing_branch_refs?.includes(currentBranch)
  ) {
    notification.info(
      t('Already Merged'),
      t("'{source}' is already fully merged into '{target}'.", {
        source: props.branch.name,
        target: currentBranch,
      }),
    );
    emit('close');
    return;
  }
  repoStore.targetBranchForAction = props.branch.name;
  repoStore.openModal('merge');
  emit('close');
}

function handleManageWorktrees() {
  repoStore.openModal('worktreeManager');
  emit('close');
}

async function handleUpdate() {
  try {
    if (isCurrentBranch.value) {
      await repoStore.pullRemote();
    } else {
      await repoStore.updateBranch(props.branch.name);
    }
    notification.success(
      t('Branch Updated'),
      t("Branch '{branch}' is up to date with its tracked remote branch.", { branch: props.branch.name }),
    );
  } catch (error) {
    notification.error(t('Update Failed'), formatGitError(error));
  } finally {
    emit('close');
  }
}

async function handlePush() {
  emit('close');
  notification.info(t('Git Push'), t("Pushing commits to remote..."));
  try {
    const pushed = await pushWithRecovery({ branchName: props.branch.name });
    if (pushed) notification.success(t('Push Completed'), t('Local commits pushed successfully.'));
  } catch (error) {
    notification.error(t('Push Failed'), formatGitError(error, t('Failed to push to remote')));
  }
}

function handleRename() {
  repoStore.targetBranchForAction = props.branch.name;
  repoStore.openModal('renameBranch');
  emit('close');
}

async function handleDelete() {
  try {
    if (await confirmation.confirm({ title: t('Delete Branch'), message: t("Delete branch '{branch}'?", { branch: props.branch.name }), danger: true, confirmText: t('Delete') })) {
      await repoStore.deleteBranch(props.branch.name, true);
      notification.success(t('Delete'), props.branch.name);
    }
  } catch (error) {
    notification.error(t('Operation Failed'), formatGitError(error));
  } finally {
    emit('close');
  }
}

function handleClickOutside() {
  emit('close');
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close');
}

onMounted(() => {
  window.addEventListener('click', handleClickOutside);
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('click', handleClickOutside);
  window.removeEventListener('keydown', handleKeyDown);
});
</script>

<template>
  <Teleport to="body">
    <div
      ref="menuRef"
      class="fixed z-50 arco-menu w-72 text-xs select-none"
      :style="menuStyle"
      role="menu"
      @click.stop
      @contextmenu.prevent
    >
      <!-- CASE 1: Current Active Branch -->
      <template v-if="isCurrentBranch">
        <button
          @click="handleNewBranchFrom"
          role="menuitem"
          class="arco-menu-item font-medium"
        >
          <GitBranch class="w-3.5 h-3.5 text-primary shrink-0" />
          <span class="truncate">{{ t("New Branch from '{branch}'...", { branch: branch.name }) }}</span>
        </button>

        <button
          @click="handleShowDiffWithWorkingTree"
          role="menuitem"
          class="arco-menu-item font-medium"
        >
          <FileDiff class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span class="truncate">{{ t('Show Diff with Working Tree') }}</span>
        </button>

        <div class="arco-menu-divider"></div>

        <button
          @click="handleNewWorktree"
          role="menuitem"
          class="arco-menu-item font-medium"
        >
          <FolderTree class="w-3.5 h-3.5 text-teal-500 shrink-0" />
          <span class="truncate">{{ t("New Worktree from '{branch}'...", { branch: branch.name }) }}</span>
        </button>
        <button
          @click="handleManageWorktrees"
          role="menuitem"
          class="arco-menu-item font-medium"
        >
          <FolderGit2 class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span class="truncate">{{ t('Manage Worktrees') }}</span>
        </button>

        <div class="arco-menu-divider"></div>

        <button
          @click="handleUpdate"
          role="menuitem"
          class="arco-menu-item font-medium"
        >
          <ArrowDownCircle class="w-3.5 h-3.5 text-rose-500 shrink-0" />
          <span>{{ t('Update') }}</span>
        </button>

        <button
          @click="handlePush"
          role="menuitem"
          class="arco-menu-item font-medium"
        >
          <ArrowUpCircle class="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span>{{ t('Push...') }}</span>
        </button>

        <div class="mx-1 px-2.5 py-1.5 flex items-center gap-2 text-muted-foreground text-[11px]">
          <Globe class="w-3.5 h-3.5 shrink-0 opacity-70" />
          <span class="truncate">{{ t("Tracked Branch '{branch}'", { branch: trackedBranchName }) }}</span>
        </div>

        <div class="arco-menu-divider"></div>

        <button
          @click="handleRename"
          role="menuitem"
          class="arco-menu-item justify-between font-medium"
        >
          <span class="flex items-center gap-2 min-w-0">
            <Edit3 class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span>{{ t('Rename...') }}</span>
          </span>
          <span class="text-[10px] text-muted-foreground font-mono">Alt+Shift+R</span>
        </button>
      </template>

      <!-- CASE 2: Remote Branch -->
      <template v-else-if="isRemoteBranch">
        <button
          @click="handleCheckout"
          role="menuitem"
          class="arco-menu-item text-primary font-semibold"
        >
          <CheckCircle2 class="w-3.5 h-3.5 shrink-0" />
          <span>{{ t('Checkout') }}</span>
        </button>

        <button
          @click="handleNewBranchFrom"
          role="menuitem"
          class="arco-menu-item font-medium"
        >
          <GitBranch class="w-3.5 h-3.5 text-violet-500 shrink-0" />
          <span class="truncate">{{ t("New Branch from '{branch}'...", { branch: branch.name }) }}</span>
        </button>

        <div class="arco-menu-divider"></div>

        <button
          @click="handleMergeInto"
          role="menuitem"
          class="arco-menu-item font-medium"
        >
          <GitMerge class="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span class="truncate">{{ t("Merge '{source}' into '{target}'", { source: branch.name, target: repoStore.repoInfo?.head_branch || 'HEAD' }) }}</span>
        </button>

        <button
          @click="handleRebaseOnto"
          role="menuitem"
          class="arco-menu-item font-medium"
        >
          <GitPullRequest class="w-3.5 h-3.5 text-sky-500 shrink-0" />
          <span class="truncate">{{ t("Rebase '{source}' onto '{target}'", { source: repoStore.repoInfo?.head_branch || 'HEAD', target: branch.name }) }}</span>
        </button>

        <div class="arco-menu-divider"></div>

        <button
          @click="handleCompare"
          role="menuitem"
          class="arco-menu-item font-medium"
        >
          <GitCompareArrows class="w-3.5 h-3.5 text-primary shrink-0" />
          <span class="truncate">{{ t("Compare with '{branch}'", { branch: repoStore.repoInfo?.head_branch || 'HEAD' }) }}</span>
        </button>
        <button
          @click="handleShowDiffWithWorkingTree"
          role="menuitem"
          class="arco-menu-item font-medium"
        >
          <FileDiff class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span class="truncate">{{ t('Show Diff with Working Tree') }}</span>
        </button>

        <div class="arco-menu-divider"></div>

        <button
          @click="handleNewWorktree"
          role="menuitem"
          class="arco-menu-item font-medium"
        >
          <FolderTree class="w-3.5 h-3.5 text-teal-500 shrink-0" />
          <span class="truncate">{{ t("New Worktree from '{branch}'...", { branch: branch.name }) }}</span>
        </button>
        <button
          @click="handleManageWorktrees"
          role="menuitem"
          class="arco-menu-item font-medium"
        >
          <FolderGit2 class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span class="truncate">{{ t('Manage Worktrees') }}</span>
        </button>

        <div class="arco-menu-divider"></div>

        <button
          @click="handleDelete"
          role="menuitem"
          class="arco-menu-item arco-menu-item-danger font-medium"
        >
          <Trash2 class="w-3.5 h-3.5 shrink-0" />
          <span>{{ t('Delete') }}</span>
        </button>
      </template>

      <!-- CASE 3: Other Local Branch -->
      <template v-else>
        <button
          @click="handleCheckout"
          role="menuitem"
          class="arco-menu-item text-primary font-semibold"
        >
          <CheckCircle2 class="w-3.5 h-3.5 shrink-0" />
          <span>{{ t('Checkout') }}</span>
        </button>

        <button
          @click="handleNewBranchFrom"
          role="menuitem"
          class="arco-menu-item font-medium"
        >
          <GitBranch class="w-3.5 h-3.5 text-violet-500 shrink-0" />
          <span class="truncate">{{ t("New Branch from '{branch}'...", { branch: branch.name }) }}</span>
        </button>

        <button
          @click="handleCheckoutAndRebase"
          role="menuitem"
          class="arco-menu-item font-medium"
        >
          <GitPullRequest class="w-3.5 h-3.5 text-sky-500 shrink-0" />
          <span class="truncate">{{ t("Checkout and Rebase onto '{branch}'", { branch: repoStore.repoInfo?.head_branch || 'HEAD' }) }}</span>
        </button>

        <button
          @click="handleCheckoutAndUpdate"
          role="menuitem"
          class="arco-menu-item font-medium"
        >
          <ArrowDownCircle class="w-3.5 h-3.5 text-rose-500 shrink-0" />
          <span class="truncate">{{ t('Checkout and Update') }}</span>
        </button>

        <div class="arco-menu-divider"></div>

        <button
          @click="handleCompare"
          role="menuitem"
          class="arco-menu-item font-medium"
        >
          <GitCompareArrows class="w-3.5 h-3.5 text-primary shrink-0" />
          <span class="truncate">{{ t("Compare with '{branch}'", { branch: repoStore.repoInfo?.head_branch || 'HEAD' }) }}</span>
        </button>
        <button
          @click="handleShowDiffWithWorkingTree"
          role="menuitem"
          class="arco-menu-item font-medium"
        >
          <FileDiff class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span class="truncate">{{ t('Show Diff with Working Tree') }}</span>
        </button>

        <div class="arco-menu-divider"></div>

        <button
          @click="handleRebaseOnto"
          role="menuitem"
          class="arco-menu-item font-medium"
        >
          <GitPullRequest class="w-3.5 h-3.5 text-sky-500 shrink-0" />
          <span class="truncate">{{ t("Rebase '{source}' onto '{target}'", { source: repoStore.repoInfo?.head_branch || 'HEAD', target: branch.name }) }}</span>
        </button>

        <button
          @click="handleMergeInto"
          role="menuitem"
          class="arco-menu-item font-medium"
        >
          <GitMerge class="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span class="truncate">{{ t("Merge '{source}' into '{target}'", { source: branch.name, target: repoStore.repoInfo?.head_branch || 'HEAD' }) }}</span>
        </button>

        <div class="arco-menu-divider"></div>

        <button
          @click="handleNewWorktree"
          role="menuitem"
          class="arco-menu-item font-medium"
        >
          <FolderTree class="w-3.5 h-3.5 text-teal-500 shrink-0" />
          <span class="truncate">{{ t("New Worktree from '{branch}'...", { branch: branch.name }) }}</span>
        </button>
        <button
          @click="handleManageWorktrees"
          role="menuitem"
          class="arco-menu-item font-medium"
        >
          <FolderGit2 class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span class="truncate">{{ t('Manage Worktrees') }}</span>
        </button>

        <div class="arco-menu-divider"></div>

        <button
          @click="handleUpdate"
          role="menuitem"
          class="arco-menu-item font-medium"
        >
          <ArrowDownCircle class="w-3.5 h-3.5 text-rose-500 shrink-0" />
          <span>{{ t('Update') }}</span>
        </button>
        <button
          @click="handlePush"
          role="menuitem"
          class="arco-menu-item font-medium"
        >
          <ArrowUpCircle class="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span>{{ t('Push...') }}</span>
        </button>
        <div class="mx-1 px-2.5 py-1.5 flex items-center gap-2 text-muted-foreground text-[11px]">
          <Globe class="w-3.5 h-3.5 shrink-0 opacity-70" />
          <span class="truncate">{{ t("Tracked Branch '{branch}'", { branch: trackedBranchName }) }}</span>
        </div>

        <div class="arco-menu-divider"></div>

        <button
          @click="handleRename"
          role="menuitem"
          class="arco-menu-item justify-between font-medium"
        >
          <span class="flex items-center gap-2 min-w-0">
            <Edit3 class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span>{{ t('Rename...') }}</span>
          </span>
          <span class="text-[10px] text-muted-foreground font-mono">Alt+Shift+R</span>
        </button>

        <button
          @click="handleDelete"
          role="menuitem"
          class="arco-menu-item arco-menu-item-danger font-medium"
        >
          <Trash2 class="w-3.5 h-3.5 shrink-0" />
          <span>{{ t('Delete') }}</span>
        </button>
      </template>
    </div>
  </Teleport>
</template>
