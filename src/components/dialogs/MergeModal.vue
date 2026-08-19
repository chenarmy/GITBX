<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { GitMerge, X, AlertCircle } from 'lucide-vue-next';

const repoStore = useRepoStore();

const targetBranch = ref('');
const strategy = ref<'default' | 'no-ff' | 'squash' | 'ff-only'>('default');
const customMessage = ref('');
const isSubmitting = ref(false);
const errorMsg = ref<string | null>(null);

watch(
  () => repoStore.targetBranchForAction,
  (val) => {
    if (val) targetBranch.value = val;
  }
);

async function handleMerge() {
  if (!targetBranch.value.trim()) return;
  isSubmitting.value = true;
  errorMsg.value = null;
  try {
    const res = await repoStore.mergeBranch(
      targetBranch.value.trim(),
      strategy.value,
      customMessage.value.trim() || undefined
    );
    if (res.conflict) {
      errorMsg.value = 'Merge conflicts detected. Please resolve conflicts in the editor.';
    } else {
      repoStore.isMergeModalOpen = false;
    }
  } catch (err: any) {
    errorMsg.value = err?.message || 'Failed to merge branch';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div
    v-if="repoStore.isMergeModalOpen"
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
  >
    <div
      class="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs"
    >
      <div class="h-11 bg-muted/50 px-4 flex items-center justify-between border-b border-border select-none">
        <div class="flex items-center space-x-2">
          <GitMerge class="w-4 h-4 text-amber-400" />
          <span class="font-bold text-sm text-foreground">
            Merge into '{{ repoStore.repoInfo?.head_branch || 'main' }}'
          </span>
        </div>
        <button
          @click="repoStore.isMergeModalOpen = false"
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
          <label class="text-[11px] font-semibold text-muted-foreground">Source Branch to Merge</label>
          <select
            v-model="targetBranch"
            class="w-full bg-background border border-border rounded px-3 py-2 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option
              v-for="b in repoStore.branches.filter(b => b.name !== repoStore.repoInfo?.head_branch)"
              :key="b.name"
              :value="b.name"
            >
              {{ b.name }}
            </option>
          </select>
        </div>

        <div>
          <label class="text-[11px] font-semibold text-muted-foreground">Merge Strategy</label>
          <div class="space-y-1.5 mt-1">
            <label class="flex items-center space-x-2 cursor-pointer">
              <input type="radio" v-model="strategy" value="default" class="text-primary" />
              <span>Default (Fast-forward if possible, otherwise merge commit)</span>
            </label>
            <label class="flex items-center space-x-2 cursor-pointer">
              <input type="radio" v-model="strategy" value="no-ff" class="text-primary" />
              <span>Always create merge commit (--no-ff)</span>
            </label>
            <label class="flex items-center space-x-2 cursor-pointer">
              <input type="radio" v-model="strategy" value="squash" class="text-primary" />
              <span>Squash merge (--squash)</span>
            </label>
            <label class="flex items-center space-x-2 cursor-pointer">
              <input type="radio" v-model="strategy" value="ff-only" class="text-primary" />
              <span>Fast-forward only (--ff-only)</span>
            </label>
          </div>
        </div>

        <div v-if="strategy === 'no-ff' || strategy === 'squash'">
          <label class="text-[11px] font-semibold text-muted-foreground">Custom Commit Message (Optional)</label>
          <input
            v-model="customMessage"
            type="text"
            placeholder="e.g. merge: pull request #12 from feature/auth"
            class="w-full bg-background border border-border rounded px-3 py-2 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div class="h-12 bg-muted/30 px-4 flex items-center justify-end space-x-2 border-t border-border">
        <button
          @click="repoStore.isMergeModalOpen = false"
          class="px-3 py-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition"
        >
          Cancel
        </button>
        <button
          @click="handleMerge"
          :disabled="!targetBranch || isSubmitting"
          class="px-4 py-1.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition disabled:opacity-40"
        >
          {{ isSubmitting ? 'Merging...' : `Merge '${targetBranch}'` }}
        </button>
      </div>
    </div>
  </div>
</template>
