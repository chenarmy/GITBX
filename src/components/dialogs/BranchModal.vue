<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { GitBranch, AlertCircle } from 'lucide-vue-next';
import ArcoModal from '@/components/ui/ArcoModal.vue';
import { useI18n } from '@/i18n';

const repoStore = useRepoStore();
const { t } = useI18n();

const branchName = ref('');
const checkoutOnCreate = ref(true);
const isSubmitting = ref(false);
const errorMsg = ref<string | null>(null);

watch(
  () => repoStore.isBranchModalOpen,
  (isOpen) => {
    if (isOpen) {
      errorMsg.value = null;
      branchName.value = '';
    }
  }
);

function closeModal() {
  repoStore.targetBranchForAction = '';
  repoStore.closeModal('branch');
}

const startingPointDisplay = computed(() => {
  if (repoStore.targetBranchForAction) {
    return repoStore.targetBranchForAction;
  }
  if (repoStore.selectedCommit) {
    return `${repoStore.selectedCommit.short_id} - ${repoStore.selectedCommit.summary}`;
  }
  return t('Current HEAD');
});

async function handleCreate() {
  if (!branchName.value.trim()) return;
  isSubmitting.value = true;
  errorMsg.value = null;
  try {
    const startPoint = repoStore.targetBranchForAction || repoStore.selectedCommit?.id;
    await repoStore.createBranch(
      branchName.value.trim(),
      startPoint,
      checkoutOnCreate.value
    );
    branchName.value = '';
    repoStore.targetBranchForAction = '';
    closeModal();
  } catch (err: any) {
    errorMsg.value = err?.message || 'Failed to create branch';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <ArcoModal
    v-if="repoStore.isBranchModalOpen"
    :title="t('Create new branch')"
    icon-bg-class="bg-purple-500/10 text-purple-500"
    body-class="space-y-4"
    @close="closeModal"
  >
    <template #icon>
      <GitBranch class="w-4 h-4" aria-hidden="true" />
    </template>

    <div v-if="errorMsg" class="arco-alert arco-alert-danger">
      <AlertCircle class="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>{{ errorMsg }}</span>
    </div>

    <div>
      <label class="text-[11px] font-semibold text-muted-foreground">{{ t('Branch Name') }}</label>
      <input
        v-model="branchName"
        type="text"
        placeholder="e.g. feat/user-auth or fix/issue-123"
        class="arco-input mt-1.5"
        @keydown.enter="handleCreate"
      />
    </div>

    <div class="rounded-[6px] border border-border/80 bg-[hsl(var(--arco-fill-1))] p-3 space-y-1">
      <div class="text-[11px] text-muted-foreground">{{ t('Starting Point:') }}</div>
      <div class="font-mono text-foreground text-[12px]">
        {{ startingPointDisplay }}
      </div>
    </div>

    <label class="flex items-center space-x-2 cursor-pointer select-none">
      <input
        v-model="checkoutOnCreate"
        type="checkbox"
        class="accent-[hsl(var(--primary))]"
      />
      <span class="text-foreground">{{ t('Checkout branch after creation') }}</span>
    </label>

    <template #footer>
      <button
        type="button"
        @click="closeModal"
        class="arco-btn arco-btn-secondary"
      >
        {{ t('Cancel') }}
      </button>
      <button
        type="button"
        @click="handleCreate"
        :disabled="!branchName.trim() || isSubmitting"
        class="arco-btn arco-btn-primary"
      >
        {{ isSubmitting ? 'Creating...' : t('Create Branch') }}
      </button>
    </template>
  </ArcoModal>
</template>
