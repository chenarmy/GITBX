<script setup lang="ts">
import { ref } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { RotateCcw, X, AlertTriangle } from 'lucide-vue-next';

const repoStore = useRepoStore();

const resetMode = ref<'--soft' | '--mixed' | '--hard'>('--mixed');
const isSubmitting = ref(false);

async function handleReset() {
  if (!repoStore.selectedCommit) return;
  isSubmitting.value = true;
  try {
    await repoStore.reset(repoStore.selectedCommit.id, resetMode.value);
    repoStore.isResetModalOpen = false;
  } catch (err: any) {
    alert(err?.message || 'Failed to reset');
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div
    v-if="repoStore.isResetModalOpen"
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
  >
    <div
      class="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs"
    >
      <div class="h-11 bg-muted/50 px-4 flex items-center justify-between border-b border-border select-none">
        <div class="flex items-center space-x-2">
          <RotateCcw class="w-4 h-4 text-rose-400" />
          <span class="font-bold text-sm text-foreground">Reset Branch to Commit</span>
        </div>
        <button
          @click="repoStore.isResetModalOpen = false"
          class="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <div class="p-4 space-y-4">
        <div class="p-2.5 rounded bg-muted/40 border border-border space-y-1">
          <div class="text-muted-foreground">Target Commit:</div>
          <div class="font-mono text-foreground">
            {{ repoStore.selectedCommit?.short_id }} - {{ repoStore.selectedCommit?.summary }}
          </div>
        </div>

        <div class="space-y-2">
          <label class="text-[11px] font-semibold text-muted-foreground">Reset Type</label>

          <label class="flex items-start space-x-2.5 p-2 rounded border border-border/60 hover:bg-accent/40 cursor-pointer">
            <input type="radio" v-model="resetMode" value="--soft" class="mt-0.5 text-primary" />
            <div>
              <div class="font-semibold text-foreground">Soft (--soft)</div>
              <div class="text-[11px] text-muted-foreground">Keep all changes staged in the index. No file changes are lost.</div>
            </div>
          </label>

          <label class="flex items-start space-x-2.5 p-2 rounded border border-border/60 hover:bg-accent/40 cursor-pointer">
            <input type="radio" v-model="resetMode" value="--mixed" class="mt-0.5 text-primary" />
            <div>
              <div class="font-semibold text-foreground">Mixed (--mixed, Default)</div>
              <div class="text-[11px] text-muted-foreground">Keep all working tree changes unstaged. Index is reset.</div>
            </div>
          </label>

          <label class="flex items-start space-x-2.5 p-2 rounded border border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10 cursor-pointer">
            <input type="radio" v-model="resetMode" value="--hard" class="mt-0.5 text-rose-400" />
            <div>
              <div class="font-semibold text-rose-300 flex items-center space-x-1">
                <span>Hard (--hard)</span>
                <AlertTriangle class="w-3 h-3 text-rose-400" />
              </div>
              <div class="text-[11px] text-rose-400/80">Discard all working tree and staged changes. Irreversible!</div>
            </div>
          </label>
        </div>
      </div>

      <div class="h-12 bg-muted/30 px-4 flex items-center justify-end space-x-2 border-t border-border">
        <button
          @click="repoStore.isResetModalOpen = false"
          class="px-3 py-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition"
        >
          Cancel
        </button>
        <button
          @click="handleReset"
          :disabled="isSubmitting"
          class="px-4 py-1.5 rounded font-semibold transition"
          :class="resetMode === '--hard' ? 'bg-destructive hover:bg-destructive/90 text-white' : 'bg-primary hover:bg-primary/90 text-primary-foreground'"
        >
          {{ isSubmitting ? 'Resetting...' : 'Confirm Reset' }}
        </button>
      </div>
    </div>
  </div>
</template>
