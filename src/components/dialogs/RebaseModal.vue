<script setup lang="ts">
import { ref, watch } from 'vue';
import { GitPullRequest, AlertCircle, ArrowUp, ArrowDown, RefreshCw } from 'lucide-vue-next';
import ArcoModal from '@/components/ui/ArcoModal.vue';
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
    repoStore.closeModal('rebase');
  } catch (error) {
    errorMsg.value = formatGitError(error, t('Failed to rebase'));
    await repoStore.loadRepo();
    const firstConflict = repoStore.statusSummary.conflicted_files[0]?.path;
    if (firstConflict) { repoStore.closeModal('rebase'); diffStore.selectConflictFile(firstConflict); }
  } finally { isSubmitting.value = false; }
}
</script>

<template>
  <ArcoModal
    v-if="repoStore.isRebaseModalOpen"
    :title="`${t('Rebase Branch')} '${repoStore.repoInfo?.head_branch || 'HEAD'}'`"
    :aria-label="t('Rebase Branch')"
    max-width-class="max-w-4xl"
    height-class="h-[76vh]"
    icon-bg-class="bg-purple-500/10 text-purple-500"
    raw-body
    @close="repoStore.closeModal('rebase')"
  >
    <template #icon>
      <GitPullRequest class="w-4 h-4" aria-hidden="true" />
    </template>

    <template #below-header>
      <div class="px-5 py-3 border-b border-border/80 bg-[hsl(var(--arco-fill-1))] flex gap-3 items-end shrink-0">
        <label class="flex-1 space-y-1">
          <span class="text-[11px] font-semibold text-muted-foreground">{{ t('Upstream Branch to Rebase Onto') }}</span>
          <select v-model="upstreamBranch" class="arco-select" @change="loadCommits">
            <option
              v-for="branch in repoStore.branches.filter(branch => branch.name !== repoStore.repoInfo?.head_branch)"
              :key="branch.name"
              :value="branch.name"
            >
              {{ branch.name }}
            </option>
          </select>
        </label>
        <label class="flex items-center gap-2 pb-1.5 cursor-pointer select-none text-foreground">
          <input v-model="interactive" type="checkbox" class="accent-[hsl(var(--primary))]" />
          <span>{{ t('Interactive Rebase') }}</span>
        </label>
        <button
          type="button"
          class="arco-icon-btn h-8 w-8 border border-border bg-card"
          :title="t('Reload')"
          @click="loadCommits"
        >
          <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isLoading }" />
        </button>
      </div>
    </template>

    <div v-if="errorMsg" class="arco-alert arco-alert-danger m-4 shrink-0">
      <AlertCircle class="w-4 h-4 shrink-0" />
      <span>{{ errorMsg }}</span>
    </div>

    <div v-if="interactive" class="flex-1 min-h-0 overflow-auto">
      <div class="grid grid-cols-[88px_84px_1fr_150px_68px] gap-2 px-4 py-2 bg-[hsl(var(--arco-fill-2))] border-b border-border/80 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sticky top-0 z-10">
        <span>{{ t('Action') }}</span>
        <span>{{ t('Commit') }}</span>
        <span>{{ t('Message') }}</span>
        <span>{{ t('Author') }}</span>
        <span>{{ t('Order') }}</span>
      </div>
      <div
        v-for="(commit, index) in commits"
        :key="commit.id"
        class="grid grid-cols-[88px_84px_1fr_150px_68px] gap-2 px-4 py-2 border-b border-border/70 items-center hover:bg-accent/40 transition-colors"
      >
        <select
          v-model="commit.action"
          class="arco-select arco-select-sm font-medium"
          :class="commit.action === 'drop' ? 'text-[hsl(var(--arco-danger))]' : commit.action === 'squash' || commit.action === 'fixup' ? 'text-[hsl(var(--arco-warning))]' : 'text-primary'"
        >
          <option v-for="action in actions" :key="action" :value="action">{{ action }}</option>
        </select>
        <span class="font-mono text-primary font-medium">{{ commit.short_id }}</span>
        <input v-if="commit.action === 'reword'" v-model="commit.newMessage" class="arco-input arco-input-sm" />
        <span v-else class="truncate text-foreground" :class="commit.action === 'drop' ? 'line-through text-muted-foreground' : ''">
          {{ commit.summary }}
        </span>
        <span class="truncate text-muted-foreground">{{ commit.author_name }}</span>
        <div class="flex items-center gap-0.5">
          <button type="button" class="arco-icon-btn-sm" :disabled="index === 0" @click="move(index, -1)">
            <ArrowUp class="w-3.5 h-3.5" />
          </button>
          <button type="button" class="arco-icon-btn-sm" :disabled="index === commits.length - 1" @click="move(index, 1)">
            <ArrowDown class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div v-if="isLoading" class="p-8 text-center text-muted-foreground">{{ t('Loading...') }}</div>
      <div v-else-if="commits.length === 0" class="p-8 text-center text-muted-foreground">{{ t('No commits to rebase.') }}</div>
    </div>
    <div v-else class="flex-1 p-6 text-muted-foreground leading-relaxed">
      {{ t('Rebase all unique commits onto the selected upstream branch.') }}
    </div>

    <template #footer>
      <button type="button" class="arco-btn arco-btn-secondary" @click="repoStore.closeModal('rebase')">
        {{ t('Cancel') }}
      </button>
      <button
        type="button"
        class="arco-btn arco-btn-primary"
        :disabled="!upstreamBranch || isSubmitting || (interactive && commits.length === 0)"
        @click="handleRebase"
      >
        {{ isSubmitting ? t('Rebasing...') : t('Start Rebase') }}
      </button>
    </template>
  </ArcoModal>
</template>
