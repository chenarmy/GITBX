<script setup lang="ts">
import { ref, watch } from 'vue';
import { GitPullRequest, X, AlertCircle, ArrowUp, ArrowDown, RefreshCw } from 'lucide-vue-next';
import { useRepoStore } from '@/stores/repo';
import { useDiffStore } from '@/stores/diff';
import { useGitApi, formatGitError } from '@/composables/useGitApi';
import { useI18n } from '@/i18n';
import type { RebaseAction, RebaseCommit, RebasePlanItem } from '@/types/git';

interface EditableCommit extends RebaseCommit { action: RebaseAction; newMessage: string }
const repoStore = useRepoStore();
const diffStore = useDiffStore();
const gitApi = useGitApi();
const { t } = useI18n();
const upstreamBranch = ref('');
const interactive = ref(true);
const commits = ref<EditableCommit[]>([]);
const isLoading = ref(false);
const isSubmitting = ref(false);
const errorMsg = ref<string | null>(null);
const actions: RebaseAction[] = ['pick', 'reword', 'squash', 'fixup', 'drop'];

async function loadCommits() {
  if (!upstreamBranch.value || !repoStore.activeRepoPath) return;
  isLoading.value = true;
  errorMsg.value = null;
  try {
    const result = await gitApi.getInteractiveRebaseCommits(repoStore.activeRepoPath, upstreamBranch.value);
    commits.value = result.map((commit) => ({ ...commit, action: 'pick', newMessage: commit.summary }));
  } catch (error) { errorMsg.value = formatGitError(error); commits.value = []; }
  finally { isLoading.value = false; }
}

watch(() => repoStore.targetBranchForAction, (value) => { if (value) { upstreamBranch.value = value; void loadCommits(); } });
watch(() => repoStore.isRebaseModalOpen, (open) => {
  if (!open) return;
  if (!upstreamBranch.value) upstreamBranch.value = repoStore.branches.find((branch) => !branch.is_head && !branch.is_remote)?.name || '';
  void loadCommits();
});

function move(index: number, offset: number) {
  const target = index + offset;
  if (target < 0 || target >= commits.value.length) return;
  const [item] = commits.value.splice(index, 1);
  commits.value.splice(target, 0, item);
}

async function handleRebase() {
  if (!upstreamBranch.value.trim()) return;
  isSubmitting.value = true;
  errorMsg.value = null;
  try {
    if (interactive.value) {
      const plan: RebasePlanItem[] = commits.value.map((commit) => ({ commit_id: commit.id, action: commit.action, message: commit.action === 'reword' ? commit.newMessage : undefined }));
      await repoStore.interactiveRebase(upstreamBranch.value.trim(), plan);
    } else {
      const result = await repoStore.rebase(upstreamBranch.value.trim());
      if (!result.success) throw new Error(result.error || t('Failed to rebase'));
    }
    repoStore.isRebaseModalOpen = false;
  } catch (error) {
    errorMsg.value = formatGitError(error, t('Failed to rebase'));
    await repoStore.loadRepo();
    const firstConflict = repoStore.statusSummary.conflicted_files[0]?.path;
    if (firstConflict) { repoStore.isRebaseModalOpen = false; diffStore.selectConflictFile(firstConflict); }
  } finally { isSubmitting.value = false; }
}
</script>

<template>
  <div v-if="repoStore.isRebaseModalOpen" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="w-full max-w-4xl h-[76vh] bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs">
      <div class="h-11 bg-muted/50 px-4 flex items-center justify-between border-b border-border">
        <div class="flex items-center gap-2"><GitPullRequest class="w-4 h-4 text-purple-400" /><span class="font-bold text-sm">{{ t('Rebase Branch') }} '{{ repoStore.repoInfo?.head_branch || 'HEAD' }}'</span></div>
        <button class="p-1 rounded hover:bg-accent text-muted-foreground" @click="repoStore.isRebaseModalOpen = false"><X class="w-4 h-4" /></button>
      </div>
      <div class="p-3 border-b border-border flex gap-3 items-end">
        <label class="flex-1 space-y-1"><span class="font-semibold text-muted-foreground">{{ t('Upstream Branch to Rebase Onto') }}</span>
          <select v-model="upstreamBranch" class="w-full bg-background border border-border rounded px-3 py-2" @change="loadCommits">
            <option v-for="branch in repoStore.branches.filter(branch => branch.name !== repoStore.repoInfo?.head_branch)" :key="branch.name" :value="branch.name">{{ branch.name }}</option>
          </select>
        </label>
        <label class="flex items-center gap-1 pb-2"><input v-model="interactive" type="checkbox" />{{ t('Interactive Rebase') }}</label>
        <button class="p-2 rounded border border-border hover:bg-accent" :title="t('Reload')" @click="loadCommits"><RefreshCw class="w-4 h-4" /></button>
      </div>
      <div v-if="errorMsg" class="m-3 p-2.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-500 flex gap-2"><AlertCircle class="w-4 h-4" />{{ errorMsg }}</div>
      <div v-if="interactive" class="flex-1 min-h-0 overflow-auto">
        <div class="grid grid-cols-[78px_80px_1fr_150px_64px] gap-2 px-3 py-2 bg-muted/40 text-[10px] font-bold uppercase text-muted-foreground sticky top-0"><span>{{ t('Action') }}</span><span>{{ t('Commit') }}</span><span>{{ t('Message') }}</span><span>{{ t('Author') }}</span><span>{{ t('Order') }}</span></div>
        <div v-for="(commit, index) in commits" :key="commit.id" class="grid grid-cols-[78px_80px_1fr_150px_64px] gap-2 px-3 py-2 border-b border-border items-center">
          <select v-model="commit.action" class="bg-background border border-border rounded px-1 py-1" :class="commit.action === 'drop' ? 'text-rose-500' : commit.action === 'squash' || commit.action === 'fixup' ? 'text-amber-500' : 'text-primary'"><option v-for="action in actions" :key="action" :value="action">{{ action }}</option></select>
          <span class="font-mono text-primary">{{ commit.short_id }}</span>
          <input v-if="commit.action === 'reword'" v-model="commit.newMessage" class="bg-background border border-border rounded px-2 py-1" />
          <span v-else class="truncate" :class="commit.action === 'drop' ? 'line-through text-muted-foreground' : ''">{{ commit.summary }}</span>
          <span class="truncate text-muted-foreground">{{ commit.author_name }}</span>
          <div class="flex"><button class="p-1 hover:text-primary disabled:opacity-20" :disabled="index === 0" @click="move(index, -1)"><ArrowUp class="w-3.5 h-3.5" /></button><button class="p-1 hover:text-primary disabled:opacity-20" :disabled="index === commits.length - 1" @click="move(index, 1)"><ArrowDown class="w-3.5 h-3.5" /></button></div>
        </div>
        <div v-if="isLoading" class="p-8 text-center text-muted-foreground">{{ t('Loading...') }}</div>
        <div v-else-if="commits.length === 0" class="p-8 text-center text-muted-foreground">{{ t('No commits to rebase.') }}</div>
      </div>
      <div v-else class="flex-1 p-6 text-muted-foreground">{{ t('Rebase all unique commits onto the selected upstream branch.') }}</div>
      <div class="h-12 bg-muted/30 px-4 flex items-center justify-end gap-2 border-t border-border">
        <button class="px-3 py-1.5 rounded hover:bg-accent" @click="repoStore.isRebaseModalOpen = false">{{ t('Cancel') }}</button>
        <button class="px-4 py-1.5 rounded bg-primary text-primary-foreground font-semibold disabled:opacity-40" :disabled="!upstreamBranch || isSubmitting || (interactive && commits.length === 0)" @click="handleRebase">{{ isSubmitting ? t('Rebasing...') : t('Start Rebase') }}</button>
      </div>
    </div>
  </div>
</template>
