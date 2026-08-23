<script setup lang="ts">
import { ref } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { GitBranch, X, AlertCircle } from 'lucide-vue-next';
import { useI18n } from '@/i18n';

const repoStore = useRepoStore();
const { t } = useI18n();

const branchName = ref('');
const checkoutOnCreate = ref(true);
const isSubmitting = ref(false);
const errorMsg = ref<string | null>(null);

async function handleCreate() {
  if (!branchName.value.trim()) return;
  isSubmitting.value = true;
  errorMsg.value = null;
  try {
    await repoStore.createBranch(
      branchName.value.trim(),
      repoStore.selectedCommit?.id,
      checkoutOnCreate.value
    );
    branchName.value = '';
    repoStore.isBranchModalOpen = false;
  } catch (err: any) {
    errorMsg.value = err?.message || 'Failed to create branch';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div
    v-if="repoStore.isBranchModalOpen"
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
  >
    <div
      class="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs"
    >
      <div class="h-11 bg-muted/50 px-4 flex items-center justify-between border-b border-border select-none">
        <div class="flex items-center space-x-2">
          <GitBranch class="w-4 h-4 text-purple-400" />
          <span class="font-bold text-sm text-foreground">{{ t('Create new branch') }}</span>
        </div>
        <button
          @click="repoStore.isBranchModalOpen = false"
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
          <label class="text-[11px] font-semibold text-muted-foreground">{{ t('Branch Name') }}</label>
          <input
            v-model="branchName"
            type="text"
            placeholder="e.g. feat/user-auth or fix/issue-123"
            class="w-full bg-background border border-border rounded px-3 py-2 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            @keydown.enter="handleCreate"
          />
        </div>

        <div class="p-2.5 rounded bg-muted/40 border border-border space-y-1">
          <div class="text-muted-foreground">{{ t('Starting Point:') }}</div>
          <div class="font-mono text-foreground">
            {{ repoStore.selectedCommit ? `${repoStore.selectedCommit.short_id} - ${repoStore.selectedCommit.summary}` : t('Current HEAD') }}
          </div>
        </div>

        <label class="flex items-center space-x-2 cursor-pointer select-none">
          <input
            v-model="checkoutOnCreate"
            type="checkbox"
            class="rounded border-border text-primary focus:ring-primary"
          />
          <span class="text-foreground">{{ t('Checkout branch after creation') }}</span>
        </label>
      </div>

      <div class="h-12 bg-muted/30 px-4 flex items-center justify-end space-x-2 border-t border-border">
        <button
          @click="repoStore.isBranchModalOpen = false"
          class="px-3 py-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition"
        >
          {{ t('Cancel') }}
        </button>
        <button
          @click="handleCreate"
          :disabled="!branchName.trim() || isSubmitting"
          class="px-4 py-1.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition disabled:opacity-40"
        >
          {{ isSubmitting ? 'Creating...' : t('Create Branch') }}
        </button>
      </div>
    </div>
  </div>
</template>
