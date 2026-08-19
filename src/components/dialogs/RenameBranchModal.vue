<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { Edit3, X, AlertCircle } from 'lucide-vue-next';

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
    repoStore.isRenameBranchModalOpen = false;
  } catch (err: any) {
    errorMsg.value = err?.message || 'Failed to rename branch';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div
    v-if="repoStore.isRenameBranchModalOpen"
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
  >
    <div
      class="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs"
    >
      <div class="h-11 bg-muted/50 px-4 flex items-center justify-between border-b border-border select-none">
        <div class="flex items-center space-x-2">
          <Edit3 class="w-4 h-4 text-blue-400" />
          <span class="font-bold text-sm text-foreground">
            Rename Branch '{{ repoStore.targetBranchForAction }}'
          </span>
        </div>
        <button
          @click="repoStore.isRenameBranchModalOpen = false"
          class="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <div class="p-4 space-y-4">
        <div
          v-if="errorMsg"
          class="p-2.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-center space-x-2"
        >
          <AlertCircle class="w-4 h-4 shrink-0" />
          <span>{{ errorMsg }}</span>
        </div>

        <div>
          <label class="text-[11px] font-semibold text-muted-foreground">New Branch Name</label>
          <input
            v-model="newBranchName"
            type="text"
            placeholder="e.g. main or feature/new-design"
            class="w-full bg-background border border-border rounded px-3 py-2 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            @keydown.enter="handleRename"
          />
        </div>
      </div>

      <div class="h-12 bg-muted/30 px-4 flex items-center justify-end space-x-2 border-t border-border">
        <button
          @click="repoStore.isRenameBranchModalOpen = false"
          class="px-3 py-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition"
        >
          Cancel
        </button>
        <button
          @click="handleRename"
          :disabled="!newBranchName.trim() || newBranchName.trim() === repoStore.targetBranchForAction || isSubmitting"
          class="px-4 py-1.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition disabled:opacity-40"
        >
          {{ isSubmitting ? 'Renaming...' : 'Rename Branch' }}
        </button>
      </div>
    </div>
  </div>
</template>
