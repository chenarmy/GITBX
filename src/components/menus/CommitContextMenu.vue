<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { useConfirmationStore } from '@/stores/confirmation';
import { useNotificationStore } from '@/stores/notification';
import { formatGitError } from '@/composables/useGitApi';
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

const props = withDefaults(
  defineProps<{
    commit: GraphCommitNode;
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
const confirmation = useConfirmationStore();
const notification = useNotificationStore();
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
  try {
    if (await confirmation.confirm({ title: t('Cherry-pick Commit'), message: t('Apply {sha} ("{summary}") into {branch}?', { sha: props.commit.short_id, summary: props.commit.summary, branch: repoStore.repoInfo?.head_branch || 'HEAD' }), danger: true })) {
      await repoStore.cherryPick(props.commit.id);
    }
  } finally {
    emit('close');
  }
}

async function handleRevert() {
  try {
    if (await confirmation.confirm({ title: t('Revert Commit'), message: t('Revert {sha} ("{summary}")?', { sha: props.commit.short_id, summary: props.commit.summary }), danger: true })) {
      await repoStore.revertCommit(props.commit.id);
    }
  } finally {
    emit('close');
  }
}

function handleReset() {
  repoStore.selectedCommit = props.commit;
  repoStore.openModal('reset');
  emit('close');
}

function handleNewBranch() {
  repoStore.selectedCommit = props.commit;
  repoStore.openModal('branch');
  emit('close');
}

function handleNewTag() {
  repoStore.selectedCommit = props.commit;
  repoStore.openModal('tag');
  emit('close');
}

async function handleRebaseOnto() {
  try {
    if (await confirmation.confirm({ title: t('Rebase Branch'), message: t("Rebase '{branch}' onto {sha}?", { branch: repoStore.repoInfo?.head_branch || 'HEAD', sha: props.commit.short_id }), danger: true })) {
      await repoStore.rebase(props.commit.id);
    }
  } finally {
    emit('close');
  }
}

async function handleMergeInto() {
  try {
    if (await confirmation.confirm({ title: t('Merge Commit'), message: t("Merge {sha} into '{branch}'?", { sha: props.commit.short_id, branch: repoStore.repoInfo?.head_branch || 'HEAD' }), danger: true })) {
      const result = await repoStore.mergeBranch(props.commit.id);
      if (result.conflict) {
        notification.warning(t('Merge Conflict'), result.error || t('Resolve every conflicted file before continuing.'));
      } else if (result.success) {
        notification.success(t('Merge Completed'), t("Merged '{source}' into '{target}'.", {
          source: props.commit.short_id,
          target: repoStore.repoInfo?.head_branch || 'HEAD',
        }));
      } else {
        notification.error(t('Merge Failed'), result.error || t('Operation Failed'));
      }
    }
  } catch (error) {
    notification.error(t('Merge Failed'), formatGitError(error));
  } finally {
    emit('close');
  }
}

function handleCopySha() {
  navigator.clipboard.writeText(props.commit.id).catch((err) => {
    console.warn('Failed to copy commit SHA:', err);
  });
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
  <Teleport to="body">
    <div
      class="fixed z-50 arco-menu w-64 text-xs select-none"
      :style="menuStyle"
      role="menu"
      @click.stop
    >
      <button
        @click="handleCherryPick"
        role="menuitem"
        class="arco-menu-item font-medium"
      >
        <GitCommit class="w-3.5 h-3.5 text-primary shrink-0" />
        <span>{{ t('Cherry-pick Commit...') }}</span>
      </button>

      <button
        @click="handleRevert"
        role="menuitem"
        class="arco-menu-item font-medium"
      >
        <RotateCcw class="w-3.5 h-3.5 text-amber-500 shrink-0" />
        <span>{{ t('Revert Commit...') }}</span>
      </button>

      <button
        @click="handleReset"
        role="menuitem"
        class="arco-menu-item arco-menu-item-danger font-medium"
      >
        <RotateCcw class="w-3.5 h-3.5 shrink-0" />
        <span>{{ t("Reset '{branch}' to this Commit...", { branch: repoStore.repoInfo?.head_branch || 'HEAD' }) }}</span>
      </button>

      <div class="arco-menu-divider"></div>

      <button
        @click="handleNewBranch"
        role="menuitem"
        class="arco-menu-item font-medium"
      >
        <GitBranch class="w-3.5 h-3.5 text-violet-500 shrink-0" />
        <span>{{ t('New Branch at this Commit...') }}</span>
      </button>

      <button
        @click="handleNewTag"
        role="menuitem"
        class="arco-menu-item font-medium"
      >
        <Tag class="w-3.5 h-3.5 text-amber-500 shrink-0" />
        <span>{{ t('New Tag at this Commit...') }}</span>
      </button>

      <div class="arco-menu-divider"></div>

      <button
        @click="handleRebaseOnto"
        role="menuitem"
        class="arco-menu-item font-medium"
      >
        <GitPullRequest class="w-3.5 h-3.5 text-sky-500 shrink-0" />
        <span>{{ t('Rebase onto this Commit...') }}</span>
      </button>

      <button
        @click="handleMergeInto"
        role="menuitem"
        class="arco-menu-item font-medium"
      >
        <GitMerge class="w-3.5 h-3.5 text-amber-500 shrink-0" />
        <span>{{ t('Merge this Commit into HEAD...') }}</span>
      </button>

      <div class="arco-menu-divider"></div>

      <button
        @click="handleCopySha"
        role="menuitem"
        class="arco-menu-item text-muted-foreground font-medium"
      >
        <Copy class="w-3.5 h-3.5 shrink-0" />
        <span>{{ t('Copy Commit SHA ({sha})', { sha: commit.short_id }) }}</span>
      </button>
    </div>
  </Teleport>
</template>
