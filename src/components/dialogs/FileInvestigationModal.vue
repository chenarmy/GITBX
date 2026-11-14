<script setup lang="ts">
import { ref, watch } from 'vue';
import { History, ListTree, GitCompareArrows, LoaderCircle } from 'lucide-vue-next';
import ArcoModal from '@/components/ui/ArcoModal.vue';
import { useDiffStore } from '@/stores/diff';
import { useRepoStore } from '@/stores/repo';
import { useNotificationStore } from '@/stores/notification';
import { useGitApi, formatGitError } from '@/composables/useGitApi';
import { useI18n } from '@/i18n';
import type { BlameLine, FileHistoryEntry } from '@/types/git';

const diffStore = useDiffStore();
const repoStore = useRepoStore();
const notification = useNotificationStore();
const gitApi = useGitApi();
const { t } = useI18n();
const history = ref<FileHistoryEntry[]>([]);
const blame = ref<BlameLine[]>([]);
const baseRevision = ref('HEAD~1');
const targetRevision = ref('HEAD');
const loading = ref(false);
const errorMessage = ref('');

function close() {
  diffStore.isFileInvestigationOpen = false;
}

async function loadActiveTab() {
  const repoPath = repoStore.activeRepoPath;
  const filePath = diffStore.selectedFile;
  if (!repoPath || !filePath || diffStore.fileInvestigationTab === 'compare') return;
  loading.value = true;
  errorMessage.value = '';
  try {
    if (diffStore.fileInvestigationTab === 'history') {
      history.value = await gitApi.getFileHistory(repoPath, filePath);
    } else {
      blame.value = await gitApi.getFileBlame(repoPath, filePath, diffStore.commitId || undefined);
    }
  } catch (error) {
    errorMessage.value = formatGitError(error);
  } finally {
    loading.value = false;
  }
}

function selectTab(tab: 'history' | 'blame' | 'compare') {
  diffStore.fileInvestigationTab = tab;
  void loadActiveTab();
}

async function showCommit(entry: FileHistoryEntry) {
  if (!repoStore.activeRepoPath || !diffStore.selectedFile) return;
  await diffStore.selectFile(diffStore.selectedFile, false, repoStore.activeRepoPath, entry.id);
  await repoStore.locateCommit(entry.id);
  close();
}

async function locateBlameCommit(line: BlameLine) {
  await repoStore.locateCommit(line.commit_id);
  close();
}

async function compareRevisions() {
  if (!repoStore.activeRepoPath || !diffStore.selectedFile) return;
  loading.value = true;
  errorMessage.value = '';
  try {
    const [baseCommitId, targetCommitId] = await Promise.all([
      gitApi.resolveRevision(repoStore.activeRepoPath, baseRevision.value.trim()),
      gitApi.resolveRevision(repoStore.activeRepoPath, targetRevision.value.trim()),
    ]);
    await diffStore.selectBranchComparisonFile(
      diffStore.selectedFile,
      undefined,
      repoStore.activeRepoPath,
      baseCommitId,
      targetCommitId,
    );
    close();
  } catch (error) {
    errorMessage.value = formatGitError(error);
    notification.error(t('Compare Failed'), errorMessage.value);
  } finally {
    loading.value = false;
  }
}

watch(
  () => diffStore.isFileInvestigationOpen,
  (open) => {
    if (open) void loadActiveTab();
  },
);
</script>

<template>
  <ArcoModal
    v-if="diffStore.isFileInvestigationOpen"
    :title="t('File Investigation')"
    :subtitle="diffStore.selectedFile || ''"
    max-width-class="max-w-5xl"
    height-class="h-[76vh]"
    raw-body
    @close="close"
  >
    <template #icon>
      <History class="w-4 h-4" aria-hidden="true" />
    </template>

    <template #below-header>
      <div class="arco-tabs bg-[hsl(var(--arco-fill-1))] shrink-0 select-none">
        <button
          v-for="tab in ([['history', History, 'File History'], ['blame', ListTree, 'Blame'], ['compare', GitCompareArrows, 'Compare Revisions']] as const)"
          :key="tab[0]"
          type="button"
          class="arco-tab"
          :class="{ 'arco-tab-active': diffStore.fileInvestigationTab === tab[0] }"
          @click="selectTab(tab[0])"
        >
          <component :is="tab[1]" class="w-3.5 h-3.5" />
          <span>{{ t(tab[2]) }}</span>
        </button>
      </div>
    </template>

    <div class="flex-1 min-h-0 overflow-auto">
      <div v-if="loading" class="h-full flex items-center justify-center text-muted-foreground gap-2">
        <LoaderCircle class="w-4 h-4 animate-spin text-primary" />
        {{ t('Loading...') }}
      </div>
      <div v-else-if="errorMessage" class="arco-alert arco-alert-danger m-4">{{ errorMessage }}</div>

      <div v-else-if="diffStore.fileInvestigationTab === 'history'" class="divide-y divide-border/70">
        <button
          v-for="entry in history"
          :key="entry.id"
          type="button"
          class="w-full text-left px-4 py-3 hover:bg-accent/55 transition-colors grid grid-cols-[84px_1fr_150px_156px] gap-3 items-center"
          @click="showCommit(entry)"
        >
          <span class="font-mono text-primary font-medium">{{ entry.short_id }}</span>
          <span class="font-semibold text-foreground truncate" :title="entry.message">{{ entry.summary }}</span>
          <span class="truncate text-muted-foreground">{{ entry.author_name }}</span>
          <span class="text-muted-foreground tabular-nums text-right">{{ new Date(entry.author_time * 1000).toLocaleString() }}</span>
        </button>
        <div v-if="history.length === 0" class="p-8 text-center text-muted-foreground">{{ t('No file history found.') }}</div>
      </div>

      <div v-else-if="diffStore.fileInvestigationTab === 'blame'" class="font-mono text-[11px] min-w-max">
        <button
          v-for="line in blame"
          :key="line.line_number"
          type="button"
          class="w-full text-left grid grid-cols-[54px_76px_130px_1fr] hover:bg-accent/45 transition-colors group"
          :title="`${line.summary} — ${line.author_email}`"
          @click="locateBlameCommit(line)"
        >
          <span class="px-2 py-0.5 text-right text-muted-foreground bg-[hsl(var(--arco-fill-1))] border-r border-border/60 tabular-nums">{{ line.line_number }}</span>
          <span class="px-2 py-0.5 text-primary">{{ line.short_id }}</span>
          <span class="px-2 py-0.5 truncate text-muted-foreground">{{ line.author_name }}</span>
          <span class="px-2 py-0.5 whitespace-pre text-foreground">{{ line.content || ' ' }}</span>
        </button>
        <div v-if="blame.length === 0" class="p-8 text-center text-muted-foreground">{{ t('No blame information found.') }}</div>
      </div>

      <div v-else class="p-6 max-w-2xl space-y-5">
        <p class="text-[12px] text-muted-foreground leading-relaxed">
          {{ t('Compare this file between any two branches, tags, or commit hashes.') }}
        </p>
        <div class="grid grid-cols-[1fr_auto_1fr] gap-3 items-end">
          <label class="space-y-1.5">
            <span class="text-[11px] font-semibold text-muted-foreground">{{ t('Base Revision') }}</span>
            <input v-model="baseRevision" class="arco-input font-mono" />
          </label>
          <GitCompareArrows class="w-5 h-5 mb-2 text-muted-foreground" />
          <label class="space-y-1.5">
            <span class="text-[11px] font-semibold text-muted-foreground">{{ t('Target Revision') }}</span>
            <input v-model="targetRevision" class="arco-input font-mono" />
          </label>
        </div>
        <button
          type="button"
          :disabled="!baseRevision.trim() || !targetRevision.trim()"
          class="arco-btn arco-btn-primary"
          @click="compareRevisions"
        >
          {{ t('Compare Revisions') }}
        </button>
      </div>
    </div>
  </ArcoModal>
</template>
