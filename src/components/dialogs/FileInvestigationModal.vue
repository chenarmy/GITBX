<script setup lang="ts">
import { ref, watch } from 'vue';
import { History, ListTree, GitCompareArrows, X, LoaderCircle } from 'lucide-vue-next';
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
  <div v-if="diffStore.isFileInvestigationOpen" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="w-full max-w-5xl h-[76vh] bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs">
      <div class="h-11 bg-muted/50 px-4 flex items-center justify-between border-b border-border">
        <div class="min-w-0">
          <div class="font-bold text-sm">{{ t('File Investigation') }}</div>
          <div class="text-[10px] text-muted-foreground font-mono truncate">{{ diffStore.selectedFile }}</div>
        </div>
        <button class="p-1 rounded hover:bg-accent text-muted-foreground" :title="t('Close')" @click="close"><X class="w-4 h-4" /></button>
      </div>

      <div class="flex border-b border-border bg-muted/20 px-3 pt-2 gap-1">
        <button v-for="tab in ([['history', History, 'File History'], ['blame', ListTree, 'Blame'], ['compare', GitCompareArrows, 'Compare Revisions']] as const)" :key="tab[0]"
          class="px-3 py-2 rounded-t flex items-center gap-1.5 border border-b-0 transition"
          :class="diffStore.fileInvestigationTab === tab[0] ? 'bg-card text-primary border-border' : 'border-transparent text-muted-foreground hover:text-foreground'"
          @click="selectTab(tab[0])">
          <component :is="tab[1]" class="w-3.5 h-3.5" /><span>{{ t(tab[2]) }}</span>
        </button>
      </div>

      <div class="flex-1 min-h-0 overflow-auto">
        <div v-if="loading" class="h-full flex items-center justify-center text-muted-foreground gap-2"><LoaderCircle class="w-4 h-4 animate-spin" />{{ t('Loading...') }}</div>
        <div v-else-if="errorMessage" class="m-4 p-3 rounded border border-rose-500/30 bg-rose-500/10 text-rose-500">{{ errorMessage }}</div>

        <div v-else-if="diffStore.fileInvestigationTab === 'history'" class="divide-y divide-border">
          <button v-for="entry in history" :key="entry.id" class="w-full text-left px-4 py-3 hover:bg-accent/60 grid grid-cols-[80px_1fr_150px_150px] gap-3 items-center" @click="showCommit(entry)">
            <span class="font-mono text-primary">{{ entry.short_id }}</span>
            <span class="font-semibold truncate" :title="entry.message">{{ entry.summary }}</span>
            <span class="truncate text-muted-foreground">{{ entry.author_name }}</span>
            <span class="text-muted-foreground">{{ new Date(entry.author_time * 1000).toLocaleString() }}</span>
          </button>
          <div v-if="history.length === 0" class="p-8 text-center text-muted-foreground">{{ t('No file history found.') }}</div>
        </div>

        <div v-else-if="diffStore.fileInvestigationTab === 'blame'" class="font-mono text-[11px] min-w-max">
          <button v-for="line in blame" :key="line.line_number" class="w-full text-left grid grid-cols-[54px_76px_130px_1fr] hover:bg-accent/50 group" :title="`${line.summary} — ${line.author_email}`" @click="locateBlameCommit(line)">
            <span class="px-2 py-0.5 text-right text-muted-foreground bg-muted/30">{{ line.line_number }}</span>
            <span class="px-2 py-0.5 text-primary">{{ line.short_id }}</span>
            <span class="px-2 py-0.5 truncate text-muted-foreground">{{ line.author_name }}</span>
            <span class="px-2 py-0.5 whitespace-pre">{{ line.content || ' ' }}</span>
          </button>
          <div v-if="blame.length === 0" class="p-8 text-center text-muted-foreground">{{ t('No blame information found.') }}</div>
        </div>

        <div v-else class="p-6 max-w-2xl space-y-5">
          <p class="text-muted-foreground">{{ t('Compare this file between any two branches, tags, or commit hashes.') }}</p>
          <div class="grid grid-cols-[1fr_auto_1fr] gap-3 items-end">
            <label class="space-y-1"><span class="font-semibold">{{ t('Base Revision') }}</span><input v-model="baseRevision" class="w-full bg-background border border-border rounded px-3 py-2 font-mono focus:outline-none focus:ring-1 focus:ring-primary" /></label>
            <GitCompareArrows class="w-5 h-5 mb-2 text-muted-foreground" />
            <label class="space-y-1"><span class="font-semibold">{{ t('Target Revision') }}</span><input v-model="targetRevision" class="w-full bg-background border border-border rounded px-3 py-2 font-mono focus:outline-none focus:ring-1 focus:ring-primary" /></label>
          </div>
          <button :disabled="!baseRevision.trim() || !targetRevision.trim()" class="px-4 py-2 rounded bg-primary text-primary-foreground font-semibold disabled:opacity-40" @click="compareRevisions">{{ t('Compare Revisions') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
