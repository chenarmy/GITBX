<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { useDiffStore } from '@/stores/diff';
import { useGitApi } from '@/composables/useGitApi';
import { useNotificationStore } from '@/stores/notification';
import { useConfirmationStore } from '@/stores/confirmation';
import type { BranchItem } from '@/types/git';
import { ChevronRight } from 'lucide-vue-next';

const props = defineProps<{
  branch: BranchItem;
  x: number;
  y: number;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const repoStore = useRepoStore();
const diffStore = useDiffStore();
const gitApi = useGitApi();
const notification = useNotificationStore();
const confirmation = useConfirmationStore();

const isCurrentBranch = computed(() => {
  return props.branch.is_head || props.branch.name === repoStore.repoInfo?.head_branch;
});

const menuStyle = computed(() => {
  const width = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const height = typeof window !== 'undefined' ? window.innerHeight : 800;
  const menuHeight = isCurrentBranch.value ? 260 : 420;
  return {
    left: `${Math.min(props.x, width - 300)}px`,
    top: `${Math.min(props.y, height - menuHeight)}px`,
  };
});

function handleCheckout() {
  repoStore.checkoutBranch(props.branch.name);
  emit('close');
}

function handleNewBranchFrom() {
  repoStore.selectedCommit = repoStore.commitNodes.find(c => c.id === props.branch.target_commit_id) || null;
  repoStore.isBranchModalOpen = true;
  emit('close');
}

async function handleCheckoutAndRebase() {
  await repoStore.checkoutBranch(props.branch.name);
  await repoStore.rebase(repoStore.repoInfo?.head_branch || 'main');
  emit('close');
}

async function handleCheckoutAndUpdate() {
  await repoStore.checkoutBranch(props.branch.name);
  await repoStore.pullRemote();
  emit('close');
}

function handleCompare() {
  diffStore.selectFile('', false, repoStore.activeRepoPath);
  notification.info('Branch comparison', `Selected ${props.branch.name} for comparison.`);
  emit('close');
}

function handleShowDiffWithWorkingTree() {
  diffStore.selectFile('', false, repoStore.activeRepoPath);
  emit('close');
}

async function handleNewWorktree() {
  const destPath = await confirmation.prompt({ title: 'Create Worktree', message: `Choose a destination directory for '${props.branch.name}'.`, inputLabel: 'Destination path' });
  if (destPath && destPath.trim()) {
    try {
      await gitApi.createWorktree(repoStore.activeRepoPath, destPath.trim(), props.branch.name);
      notification.success('Worktree created', destPath.trim());
    } catch (err: any) {
      notification.error('Worktree creation failed', err?.message || String(err));
    }
  }
  emit('close');
}

function handleRebaseOnto() {
  repoStore.targetBranchForAction = props.branch.name;
  repoStore.isRebaseModalOpen = true;
  emit('close');
}

function handleMergeInto() {
  repoStore.targetBranchForAction = props.branch.name;
  repoStore.isMergeModalOpen = true;
  emit('close');
}

function handleUpdate() {
  repoStore.pullRemote();
  emit('close');
}

function handlePush() {
  repoStore.pushRemote();
  emit('close');
}

function handleRename() {
  repoStore.targetBranchForAction = props.branch.name;
  repoStore.isRenameBranchModalOpen = true;
  emit('close');
}

async function handleDelete() {
  if (await confirmation.confirm({ title: 'Delete Branch', message: `Delete branch '${props.branch.name}'?`, danger: true, confirmText: 'Delete' })) {
    repoStore.deleteBranch(props.branch.name, true);
  }
  emit('close');
}

function handleClickOutside() {
  emit('close');
}

onMounted(() => {
  window.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  window.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <div
    class="fixed z-50 w-72 bg-popover border border-border rounded-lg shadow-2xl py-1 text-xs select-none text-foreground divide-y divide-border/60"
    :style="menuStyle"
    @click.stop
  >
    <!-- CASE 1: Current Active Branch -->
    <template v-if="isCurrentBranch">
      <div class="py-1">
        <button
          @click="handleNewBranchFrom"
          class="w-full px-3 py-1.5 text-left hover:bg-secondary flex items-center space-x-1.5 font-medium transition"
        >
          <span>New Branch from '{{ branch.name }}'...</span>
        </button>

        <button
          @click="handleShowDiffWithWorkingTree"
          class="w-full px-3 py-1.5 text-left hover:bg-secondary font-medium transition"
        >
          Show Diff with Working Tree
        </button>
      </div>

      <div class="py-1">
        <button
          @click="handleNewWorktree"
          class="w-full px-3 py-1.5 text-left hover:bg-secondary font-medium transition"
        >
          New Worktree from '{{ branch.name }}'...
        </button>
      </div>

      <div class="py-1">
        <button
          @click="handleUpdate"
          class="w-full px-3 py-1.5 text-left hover:bg-secondary font-medium transition"
        >
          Update
        </button>

        <button
          @click="handlePush"
          class="w-full px-3 py-1.5 text-left hover:bg-secondary font-medium transition"
        >
          Push...
        </button>

        <button
          class="w-full px-3 py-1.5 text-left hover:bg-secondary flex items-center justify-between text-muted-foreground hover:text-foreground font-medium transition"
        >
          <span>Tracked Branch 'origin/{{ branch.name }}'</span>
          <ChevronRight class="w-3.5 h-3.5" />
        </button>
      </div>

      <div class="py-1">
        <button
          @click="handleRename"
          class="w-full px-3 py-1.5 text-left hover:bg-secondary flex items-center justify-between font-medium transition"
        >
          <span>Rename...</span>
          <span class="text-[10px] text-muted-foreground font-mono">Alt+Shift+R</span>
        </button>
      </div>
    </template>

    <!-- CASE 2: Non-current Branch -->
    <template v-else>
      <div class="py-1">
        <button
          @click="handleCheckout"
          class="w-full px-3 py-1.5 text-left hover:bg-primary/10 hover:text-primary flex items-center justify-between font-semibold transition"
        >
          <span>Checkout</span>
        </button>

        <button
          @click="handleNewBranchFrom"
          class="w-full px-3 py-1.5 text-left hover:bg-secondary flex items-center space-x-1.5 font-medium transition"
        >
          <span>New Branch from '{{ branch.name }}'...</span>
        </button>

        <button
          @click="handleCheckoutAndRebase"
          class="w-full px-3 py-1.5 text-left hover:bg-secondary font-medium transition"
        >
          Checkout and Rebase onto '{{ repoStore.repoInfo?.head_branch }}'
        </button>

        <button
          @click="handleCheckoutAndUpdate"
          class="w-full px-3 py-1.5 text-left hover:bg-secondary font-medium transition"
        >
          Checkout and Update
        </button>
      </div>

      <div class="py-1">
        <button
          @click="handleCompare"
          class="w-full px-3 py-1.5 text-left hover:bg-secondary font-medium transition"
        >
          Compare with '{{ repoStore.repoInfo?.head_branch }}'
        </button>
        <button
          @click="handleShowDiffWithWorkingTree"
          class="w-full px-3 py-1.5 text-left hover:bg-secondary font-medium transition"
        >
          Show Diff with Working Tree
        </button>
      </div>

      <div class="py-1">
        <button
          @click="handleRebaseOnto"
          class="w-full px-3 py-1.5 text-left hover:bg-secondary flex items-center justify-between font-medium transition"
        >
          <span>Rebase '{{ repoStore.repoInfo?.head_branch }}' onto '{{ branch.name }}'</span>
        </button>

        <button
          @click="handleMergeInto"
          class="w-full px-3 py-1.5 text-left hover:bg-secondary flex items-center justify-between font-medium transition"
        >
          <span>Merge '{{ branch.name }}' into '{{ repoStore.repoInfo?.head_branch }}'</span>
        </button>
      </div>

      <div class="py-1">
        <button
          @click="handleNewWorktree"
          class="w-full px-3 py-1.5 text-left hover:bg-secondary font-medium transition"
        >
          New Worktree from '{{ branch.name }}'...
        </button>
      </div>

      <div class="py-1">
        <button
          @click="handleUpdate"
          class="w-full px-3 py-1.5 text-left hover:bg-secondary font-medium transition"
        >
          Update
        </button>
        <button
          @click="handlePush"
          class="w-full px-3 py-1.5 text-left hover:bg-secondary font-medium transition"
        >
          Push...
        </button>
        <button
          class="w-full px-3 py-1.5 text-left hover:bg-secondary flex items-center justify-between text-muted-foreground hover:text-foreground font-medium transition"
        >
          <span>Tracked Branch 'origin/{{ branch.name }}'</span>
          <ChevronRight class="w-3.5 h-3.5" />
        </button>
      </div>

      <div class="py-1">
        <button
          @click="handleRename"
          class="w-full px-3 py-1.5 text-left hover:bg-secondary flex items-center justify-between font-medium transition"
        >
          <span>Rename...</span>
          <span class="text-[10px] text-muted-foreground font-mono">Alt+Shift+R</span>
        </button>

        <button
          @click="handleDelete"
          class="w-full px-3 py-1.5 text-left hover:bg-rose-50 dark:hover:bg-destructive/20 text-rose-600 dark:text-rose-400 flex items-center space-x-1.5 font-medium transition"
        >
          <span>Delete</span>
        </button>
      </div>
    </template>
  </div>
</template>
