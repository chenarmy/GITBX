<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { useConfirmationStore } from '@/stores/confirmation';
import { useI18n } from '@/i18n';
import type { GraphCommitNode } from '@/types/graph';
import {
  GitCommit,
  GitBranch,
  GitMerge,
  GitPullRequest,
  Tag,
  RotateCcw,
  Copy,
} from 'lucide-vue-next';

const props = defineProps<{
  commit: GraphCommitNode;
  x: number;
  y: number;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const repoStore = useRepoStore();
const confirmation = useConfirmationStore();
const { t } = useI18n();

const menuStyle = computed(() => {
  const width = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const height = typeof window !== 'undefined' ? window.innerHeight : 800;
  return {
    left: `${Math.min(props.x, width - 270)}px`,
    top: `${Math.min(props.y, height - 360)}px`,
  };
});

async function handleCherryPick() {
  if (await confirmation.confirm({ title: t('Cherry-pick Commit'), message: t('Apply {sha} ("{summary}") into {branch}?', { sha: props.commit.short_id, summary: props.commit.summary, branch: repoStore.repoInfo?.head_branch || 'HEAD' }), danger: true })) {
    await repoStore.cherryPick(props.commit.id);
  }
  emit('close');
}

async function handleRevert() {
  if (await confirmation.confirm({ title: t('Revert Commit'), message: t('Revert {sha} ("{summary}")?', { sha: props.commit.short_id, summary: props.commit.summary }), danger: true })) {
    await repoStore.revertCommit(props.commit.id);
  }
  emit('close');
}

function handleReset() {
  repoStore.selectedCommit = props.commit;
  repoStore.isResetModalOpen = true;
  emit('close');
}

function handleNewBranch() {
  repoStore.selectedCommit = props.commit;
  repoStore.isBranchModalOpen = true;
  emit('close');
}

function handleNewTag() {
  repoStore.selectedCommit = props.commit;
  repoStore.isTagModalOpen = true;
  emit('close');
}

async function handleRebaseOnto() {
  if (await confirmation.confirm({ title: t('Rebase Branch'), message: t("Rebase '{branch}' onto {sha}?", { branch: repoStore.repoInfo?.head_branch || 'HEAD', sha: props.commit.short_id }), danger: true })) {
    await repoStore.rebase(props.commit.id);
  }
  emit('close');
}

async function handleMergeInto() {
  if (await confirmation.confirm({ title: t('Merge Commit'), message: t("Merge {sha} into '{branch}'?", { sha: props.commit.short_id, branch: repoStore.repoInfo?.head_branch || 'HEAD' }), danger: true })) {
    await repoStore.mergeBranch(props.commit.id);
  }
  emit('close');
}

function handleCopySha() {
  navigator.clipboard.writeText(props.commit.id);
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
    class="fixed z-50 w-64 bg-popover border border-border rounded-lg shadow-2xl py-1 text-xs select-none text-foreground divide-y divide-border/60"
    :style="menuStyle"
    @click.stop
  >
    <div class="py-1">
      <button
        @click="handleCherryPick"
        class="w-full px-3 py-1.5 text-left hover:bg-secondary flex items-center space-x-2 font-medium transition"
      >
        <GitCommit class="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
        <span>{{ t('Cherry-pick Commit...') }}</span>
      </button>

      <button
        @click="handleRevert"
        class="w-full px-3 py-1.5 text-left hover:bg-secondary flex items-center space-x-2 font-medium transition"
      >
        <RotateCcw class="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <span>{{ t('Revert Commit...') }}</span>
      </button>

      <button
        @click="handleReset"
        class="w-full px-3 py-1.5 text-left hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-700 dark:text-rose-300 flex items-center space-x-2 font-medium transition"
      >
        <RotateCcw class="w-3.5 h-3.5 text-rose-500 shrink-0" />
        <span>{{ t("Reset '{branch}' to this Commit...", { branch: repoStore.repoInfo?.head_branch || 'HEAD' }) }}</span>
      </button>
    </div>

    <div class="py-1">
      <button
        @click="handleNewBranch"
        class="w-full px-3 py-1.5 text-left hover:bg-secondary flex items-center space-x-2 font-medium transition"
      >
        <GitBranch class="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
        <span>{{ t('New Branch at this Commit...') }}</span>
      </button>

      <button
        @click="handleNewTag"
        class="w-full px-3 py-1.5 text-left hover:bg-secondary flex items-center space-x-2 font-medium transition"
      >
        <Tag class="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <span>{{ t('New Tag at this Commit...') }}</span>
      </button>
    </div>

    <div class="py-1">
      <button
        @click="handleRebaseOnto"
        class="w-full px-3 py-1.5 text-left hover:bg-secondary flex items-center space-x-2 font-medium transition"
      >
        <GitPullRequest class="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
        <span>{{ t('Rebase onto this Commit...') }}</span>
      </button>

      <button
        @click="handleMergeInto"
        class="w-full px-3 py-1.5 text-left hover:bg-secondary flex items-center space-x-2 font-medium transition"
      >
        <GitMerge class="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <span>{{ t('Merge this Commit into HEAD...') }}</span>
      </button>
    </div>

    <div class="py-1">
      <button
        @click="handleCopySha"
        class="w-full px-3 py-1.5 text-left hover:bg-secondary flex items-center space-x-2 text-muted-foreground hover:text-foreground font-medium transition"
      >
        <Copy class="w-3.5 h-3.5 shrink-0" />
        <span>{{ t('Copy Commit SHA ({sha})', { sha: commit.short_id }) }}</span>
      </button>
    </div>
  </div>
</template>
