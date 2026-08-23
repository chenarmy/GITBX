<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { useDiffStore } from '@/stores/diff';
import { GitPullRequest, X, AlertCircle } from 'lucide-vue-next';

const repoStore = useRepoStore();
const diffStore = useDiffStore();

const upstreamBranch = ref('');
const isSubmitting = ref(false);
const errorMsg = ref<string | null>(null);

watch(
  () => repoStore.targetBranchForAction,
  (val) => {
    if (val) upstreamBranch.value = val;
  }
);

async function handleRebase() {
  if (!upstreamBranch.value.trim()) return;
  isSubmitting.value = true;
  errorMsg.value = null;
  try {
    const res = await repoStore.rebase(upstreamBranch.value.trim());
    if (res.conflict) {
      repoStore.isRebaseModalOpen = false;
      const firstConflict = repoStore.statusSummary.conflicted_files[0]?.path;
      if (firstConflict) diffStore.selectConflictFile(firstConflict);
    } else if (res.success) {
      repoStore.isRebaseModalOpen = false;
    } else {
      errorMsg.value = res.error || 'Failed to rebase';
    }
  } catch (err: any) {
    errorMsg.value = err?.message || 'Failed to rebase';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div
    v-if="repoStore.isRebaseModalOpen"
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
  >
    <div
      class="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs"
    >
      <div class="h-11 bg-muted/50 px-4 flex items-center justify-between border-b border-border select-none">
        <div class="flex items-center space-x-2">
          <GitPullRequest class="w-4 h-4 text-purple-400" />
          <span class="font-bold text-sm text-foreground">
            Rebase '{{ repoStore.repoInfo?.head_branch || 'main' }}'
          </span>
        </div>
        <button
          @click="repoStore.isRebaseModalOpen = false"
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
          <label class="text-[11px] font-semibold text-muted-foreground">Upstream Branch to Rebase Onto</label>
          <select
            v-model="upstreamBranch"
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

        <p class="text-[11px] text-muted-foreground leading-relaxed">
          Rebasing replays all unique commits from '{{ repoStore.repoInfo?.head_branch }}' on top of the latest tip of '{{ upstreamBranch || 'target' }}', creating a clean linear Git history.
        </p>
      </div>

      <div class="h-12 bg-muted/30 px-4 flex items-center justify-end space-x-2 border-t border-border">
        <button
          @click="repoStore.isRebaseModalOpen = false"
          class="px-3 py-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition"
        >
          Cancel
        </button>
        <button
          @click="handleRebase"
          :disabled="!upstreamBranch || isSubmitting"
          class="px-4 py-1.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition disabled:opacity-40"
        >
          {{ isSubmitting ? 'Rebasing...' : `Rebase onto '${upstreamBranch}'` }}
        </button>
      </div>
    </div>
  </div>
</template>
