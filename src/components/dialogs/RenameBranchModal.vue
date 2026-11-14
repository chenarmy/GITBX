<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { Edit3, AlertCircle } from 'lucide-vue-next';
import ArcoModal from '@/components/ui/ArcoModal.vue';

const repoStore = useRepoStore();

const newBranchName = ref('');
const isSubmitting = ref(false);
const errorMsg = ref<string | null>(null);

watch(
  () => repoStore.targetBranchForAction,
  (val) => {
    newBranchName.value = val || '';
  }
);

async function handleRename() {
  if (!newBranchName.value.trim() || newBranchName.value.trim() === repoStore.targetBranchForAction) return;
  isSubmitting.value = true;
  errorMsg.value = null;
  try {
    await repoStore.renameBranch(repoStore.targetBranchForAction, newBranchName.value.trim());
    repoStore.closeModal('renameBranch');
  } catch (err: any) {
    errorMsg.value = err?.message || 'Failed to rename branch';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <ArcoModal
    v-if="repoStore.isRenameBranchModalOpen"
    :title="`Rename Branch '${repoStore.targetBranchForAction}'`"
    :aria-label="`Rename Branch ${repoStore.targetBranchForAction}`"
    body-class="space-y-4"
    @close="repoStore.closeModal('renameBranch')"
  >
    <template #icon>
      <Edit3 class="w-4 h-4" aria-hidden="true" />
    </template>

    <div v-if="errorMsg" class="arco-alert arco-alert-danger">
      <AlertCircle class="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>{{ errorMsg }}</span>
    </div>

    <div>
      <label class="text-[11px] font-semibold text-muted-foreground">New Branch Name</label>
      <input
        v-model="newBranchName"
        type="text"
        placeholder="e.g. main or feature/new-design"
        class="arco-input mt-1.5"
        @keydown.enter="handleRename"
      />
    </div>

    <template #footer>
      <button
        type="button"
        @click="repoStore.closeModal('renameBranch')"
        class="arco-btn arco-btn-secondary"
      >
        Cancel
      </button>
      <button
        type="button"
        @click="handleRename"
        :disabled="!newBranchName.trim() || newBranchName.trim() === repoStore.targetBranchForAction || isSubmitting"
        class="arco-btn arco-btn-primary"
      >
        {{ isSubmitting ? 'Renaming...' : 'Rename Branch' }}
      </button>
    </template>
  </ArcoModal>
</template>
