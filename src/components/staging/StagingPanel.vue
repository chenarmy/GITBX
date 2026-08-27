<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { useDiffStore } from '@/stores/diff';
import { useConfirmationStore } from '@/stores/confirmation';
import {
  Plus,
  Minus,
  FileQuestion,
  FilePlus,
  FileMinus,
  FileEdit,
  RotateCcw,
  AlertTriangle,
  GitCommit,
  GitCompareArrows,
} from 'lucide-vue-next';
import { useI18n } from '@/i18n';
import { useChangelistStore } from '@/stores/changelist';

const repoStore = useRepoStore();
const diffStore = useDiffStore();
const confirmation = useConfirmationStore();
const { t } = useI18n();
const changelistStore = useChangelistStore();

// Keep the full status in the store, but progressively render large lists so
// repositories with thousands of changes do not freeze the webview.
const FILE_PAGE_SIZE = 200;
const stagedLimit = ref(FILE_PAGE_SIZE);
const unstagedLimit = ref(FILE_PAGE_SIZE);
const untrackedLimit = ref(FILE_PAGE_SIZE);
const conflictLimit = ref(FILE_PAGE_SIZE);
const commitFileLimit = ref(FILE_PAGE_SIZE);
const branchFileLimit = ref(FILE_PAGE_SIZE);
const stagedFiles = computed(() => repoStore.statusSummary.staged_files.slice(0, stagedLimit.value));
const unstagedFiles = computed(() => repoStore.statusSummary.unstaged_files.slice(0, unstagedLimit.value));
const untrackedFiles = computed(() => repoStore.statusSummary.untracked_files.slice(0, untrackedLimit.value));
const conflictedFiles = computed(() => repoStore.statusSummary.conflicted_files.slice(0, conflictLimit.value));
const commitFiles = computed(() => repoStore.selectedCommitFiles.slice(0, commitFileLimit.value));
const branchFiles = computed(() => repoStore.branchComparisonFiles.slice(0, branchFileLimit.value));

watch(
  () => [
    repoStore.statusSummary.staged_files.length,
    repoStore.statusSummary.unstaged_files.length,
    repoStore.statusSummary.untracked_files.length,
    repoStore.statusSummary.conflicted_files.length,
    repoStore.selectedCommitFiles.length,
    repoStore.branchComparisonFiles.length,
  ],
  () => {
    stagedLimit.value = FILE_PAGE_SIZE;
    unstagedLimit.value = FILE_PAGE_SIZE;
    untrackedLimit.value = FILE_PAGE_SIZE;
    conflictLimit.value = FILE_PAGE_SIZE;
    commitFileLimit.value = FILE_PAGE_SIZE;
    branchFileLimit.value = FILE_PAGE_SIZE;
  },
);

function showMore(section: 'staged' | 'unstaged' | 'untracked' | 'conflict' | 'commit' | 'branch') {
  const limits = {
    staged: stagedLimit,
    unstaged: unstagedLimit,
    untracked: untrackedLimit,
    conflict: conflictLimit,
    commit: commitFileLimit,
    branch: branchFileLimit,
  };
  limits[section].value += FILE_PAGE_SIZE;
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'Added':
      return FilePlus;
    case 'Deleted':
      return FileMinus;
    case 'Untracked':
      return FileQuestion;
    default:
      return FileEdit;
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'Added':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'Deleted':
      return 'text-rose-600 dark:text-rose-400';
    case 'Untracked':
      return 'text-sky-600 dark:text-sky-400';
    default:
      return 'text-amber-600 dark:text-amber-400';
  }
}

async function handleDiscardFile(e: Event, filePath: string) {
  e.stopPropagation();
  if (await confirmation.confirm({ title: 'Discard Changes', message: `Discard changes to '${filePath}'? This cannot be undone.`, danger: true, confirmText: 'Discard' })) {
    repoStore.discardFile(filePath);
  }
}
</script>

<template>
  <div class="dbx-staging h-full flex flex-col bg-card border-r border-border text-xs select-none overflow-hidden">
    <!-- Conflicted Files Section -->
    <div
      v-if="repoStore.statusSummary.conflicted_files.length > 0"
      class="max-h-[38%] min-h-[92px] flex flex-col border-b border-amber-500/40 bg-amber-500/5"
    >
      <div class="dbx-pane-header h-8 px-2.5 flex items-center justify-between font-bold text-amber-700 dark:text-amber-300 border-b border-amber-500/30">
        <div class="flex items-center space-x-1.5">
          <AlertTriangle class="w-3.5 h-3.5" />
          <span>{{ t('Conflicts') }}</span>
          <span class="px-1.5 rounded text-[10px] bg-amber-200/70 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {{ repoStore.statusSummary.conflicted_files.length }}
          </span>
        </div>
        <span class="text-[10px] font-medium opacity-80">{{ t('Resolve before continuing') }}</span>
      </div>

      <div class="flex-1 overflow-y-auto p-1 space-y-0.5">
        <button
          v-for="file in conflictedFiles"
          :key="file.path"
          @click="diffStore.selectConflictFile(file.path)"
          class="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-left transition"
          :class="diffStore.selectedConflictFile === file.path ? 'bg-amber-500/20 text-amber-900 dark:text-amber-100 font-bold' : 'text-foreground hover:bg-amber-500/10'"
        >
          <span class="flex items-center space-x-1.5 min-w-0">
            <AlertTriangle class="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span class="truncate">{{ file.path }}</span>
          </span>
          <span class="text-[10px] text-amber-700 dark:text-amber-300 shrink-0">{{ t('Resolve') }}</span>
        </button>
        <button
          v-if="conflictedFiles.length < repoStore.statusSummary.conflicted_files.length"
          @click="showMore('conflict')"
          class="w-full py-1 text-[10px] text-primary hover:bg-primary/10 rounded"
        >
          {{ t('Show more ({count} remaining)', { count: repoStore.statusSummary.conflicted_files.length - conflictedFiles.length }) }}
        </button>
      </div>
    </div>

    <!-- Branch Comparison Section -->
    <div
      v-if="repoStore.branchComparison"
      class="flex-1 flex flex-col min-h-0 bg-muted/10"
    >
      <div class="dbx-pane-header h-7.5 bg-muted/50 px-2.5 flex items-center justify-between font-bold text-foreground border-b border-border">
        <div class="flex items-center space-x-1.5 min-w-0">
          <GitCompareArrows class="w-3.5 h-3.5 text-primary shrink-0" />
          <span class="truncate text-[11px]">
            {{ repoStore.branchComparison.baseBranch }} → {{ repoStore.branchComparison.targetBranch }}
          </span>
          <span class="text-[10px] text-muted-foreground shrink-0 font-normal">({{ repoStore.branchComparisonFiles.length }} {{ t('files') }})</span>
        </div>
        <button
          @click="repoStore.clearBranchComparison()"
          class="text-[10px] text-muted-foreground hover:text-foreground underline cursor-pointer shrink-0"
        >
          {{ t('Working Tree') }}
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-1 space-y-0.5">
        <div
          v-for="file in branchFiles"
          :key="`${file.old_path || ''}:${file.path}`"
          @click="diffStore.selectBranchComparisonFile(file.path, file.old_path, repoStore.activeRepoPath, repoStore.branchComparison!.baseCommitId, repoStore.branchComparison!.targetCommitId)"
          class="flex items-center justify-between px-2 py-1 rounded-md cursor-pointer transition text-xs"
          :class="diffStore.selectedFile === file.path ? 'bg-primary/15 text-primary font-bold shadow-xs' : 'text-foreground hover:bg-secondary'"
        >
          <div class="flex items-center space-x-1.5 truncate">
            <component :is="getStatusIcon(file.staged_status)" class="w-3.5 h-3.5" :class="getStatusColor(file.staged_status)" />
            <span class="truncate">{{ file.path }}</span>
          </div>
        </div>
        <div v-if="repoStore.branchComparisonFiles.length === 0" class="p-6 text-center text-muted-foreground">
          {{ t('No differences') }}
        </div>
        <button
          v-if="branchFiles.length < repoStore.branchComparisonFiles.length"
          @click="showMore('branch')"
          class="w-full py-1 text-[10px] text-primary hover:bg-primary/10 rounded"
        >
          {{ t('Show more ({count} remaining)', { count: repoStore.branchComparisonFiles.length - branchFiles.length }) }}
        </button>
      </div>
    </div>

    <!-- Selected Commit Changes Section (when inspecting a historical commit) -->
    <div
      v-else-if="repoStore.selectedCommit && diffStore.commitId"
      class="flex-1 flex flex-col min-h-0 bg-muted/10"
    >
      <div class="dbx-pane-header h-7.5 bg-muted/50 px-2.5 flex items-center justify-between font-bold text-foreground border-b border-border">
        <div class="flex items-center space-x-1.5 min-w-0">
          <GitCommit class="w-3.5 h-3.5 text-primary shrink-0" />
          <span class="font-mono text-[11px] text-primary">{{ repoStore.selectedCommit.short_id }}</span>
          <span class="text-[10px] text-muted-foreground truncate font-normal">({{ repoStore.selectedCommitFiles.length }} {{ t('files') }})</span>
        </div>
        <button
          @click="diffStore.clearSelection(); repoStore.selectedCommit = null;"
          class="text-[10px] text-muted-foreground hover:text-foreground underline cursor-pointer"
        >
          {{ t('Working Tree') }}
        </button>
      </div>

      <div class="p-2 border-b border-border bg-card/60">
        <div class="font-medium text-foreground truncate text-[11px]">{{ repoStore.selectedCommit.summary }}</div>
        <div class="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-between">
          <span>{{ repoStore.selectedCommit.author_name }}</span>
          <span>{{ new Date(repoStore.selectedCommit.author_time * 1000).toLocaleDateString() }}</span>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-1 space-y-0.5">
        <div
          v-for="file in commitFiles"
          :key="file.path"
          @click="diffStore.selectFile(file.path, false, repoStore.activeRepoPath, repoStore.selectedCommit?.id)"
          class="flex items-center justify-between px-2 py-1 rounded-md cursor-pointer transition text-xs"
          :class="diffStore.selectedFile === file.path ? 'bg-primary/15 text-primary font-bold shadow-xs' : 'text-foreground hover:bg-secondary'"
        >
          <div class="flex items-center space-x-1.5 truncate">
            <component :is="getStatusIcon(file.staged_status)" class="w-3.5 h-3.5" :class="getStatusColor(file.staged_status)" />
            <span class="truncate">{{ file.path }}</span>
          </div>
        </div>
        <button
          v-if="commitFiles.length < repoStore.selectedCommitFiles.length"
          @click="showMore('commit')"
          class="w-full py-1 text-[10px] text-primary hover:bg-primary/10 rounded"
        >
          {{ t('Show more ({count} remaining)', { count: repoStore.selectedCommitFiles.length - commitFiles.length }) }}
        </button>
      </div>
    </div>

    <!-- Staged Changes Section (Normal Working Tree) -->
    <div v-else class="flex-1 flex flex-col min-h-0 border-b border-border">
      <div class="dbx-pane-header h-7 bg-muted/40 px-2.5 flex items-center justify-between font-bold text-muted-foreground border-b border-border">
        <div class="flex items-center space-x-1.5">
          <span>{{ t('Staged Changes') }}</span>
          <span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
            {{ repoStore.statusSummary.staged_files.length }}
          </span>
        </div>
        <button
          v-if="repoStore.statusSummary.staged_files.length > 0 && !repoStore.repoInfo?.is_merging && !repoStore.repoInfo?.is_rebasing && !repoStore.repoInfo?.is_cherry_picking && !repoStore.repoInfo?.is_reverting"
          @click="repoStore.unstageAll()"
          class="text-[11px] text-muted-foreground hover:text-foreground flex items-center space-x-0.5 font-medium"
          :title="t('Unstage All')"
        >
          <Minus class="w-3 h-3" />
          <span>{{ t('Unstage All') }}</span>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-1 space-y-0.5">
        <div
          v-for="file in stagedFiles"
          :key="file.path"
          @click="diffStore.selectFile(file.path, true, repoStore.activeRepoPath)"
          class="flex items-center justify-between px-2 py-1 rounded-md cursor-pointer transition text-xs group"
          :class="diffStore.selectedFile === file.path && diffStore.isStaged ? 'bg-primary/10 text-primary font-bold shadow-xs' : 'text-foreground hover:bg-secondary'"
        >
          <div class="flex items-center space-x-1.5 truncate">
            <component :is="getStatusIcon(file.staged_status)" class="w-3.5 h-3.5" :class="getStatusColor(file.staged_status)" />
            <span class="truncate">{{ file.path }}</span>
          </div>
          <button
            v-if="!repoStore.repoInfo?.is_merging && !repoStore.repoInfo?.is_rebasing && !repoStore.repoInfo?.is_cherry_picking && !repoStore.repoInfo?.is_reverting"
            @click.stop="repoStore.unstageFile(file.path)"
            class="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
            :title="t('Unstage File')"
          >
            <Minus class="w-3 h-3" />
          </button>
        </div>
        <button
          v-if="stagedFiles.length < repoStore.statusSummary.staged_files.length"
          @click="showMore('staged')"
          class="w-full py-1 text-[10px] text-primary hover:bg-primary/10 rounded"
        >
          {{ t('Show more ({count} remaining)', { count: repoStore.statusSummary.staged_files.length - stagedFiles.length }) }}
        </button>
      </div>
    </div>

    <!-- Unstaged Changes & Untracked Files Section -->
    <div v-if="!diffStore.commitId && !repoStore.branchComparison" class="flex-1 flex flex-col min-h-0">
      <div class="dbx-pane-header h-7 bg-muted/40 px-2.5 flex items-center justify-between font-bold text-muted-foreground border-b border-border">
        <div class="flex items-center space-x-1.5">
          <span>{{ t('Changes') }}</span>
          <span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
            {{ repoStore.statusSummary.unstaged_files.length + repoStore.statusSummary.untracked_files.length }}
          </span>
        </div>
        <button
          v-if="repoStore.statusSummary.unstaged_files.length + repoStore.statusSummary.untracked_files.length > 0 && repoStore.statusSummary.conflicted_files.length === 0"
          @click="repoStore.stageAll()"
          class="text-[11px] text-muted-foreground hover:text-foreground flex items-center space-x-0.5 font-medium"
          :title="t('Stage All')"
        >
          <Plus class="w-3 h-3" />
          <span>{{ t('Stage All') }}</span>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-1 space-y-0.5">
        <!-- Unstaged modified files -->
        <div
          v-for="file in unstagedFiles"
          :key="file.path"
          @click="diffStore.selectFile(file.path, false, repoStore.activeRepoPath)"
          class="flex items-center justify-between px-2 py-1 rounded-md cursor-pointer transition text-xs group"
          :class="diffStore.selectedFile === file.path && !diffStore.isStaged ? 'bg-primary/10 text-primary font-bold shadow-xs' : 'text-foreground hover:bg-secondary'"
        >
          <div class="flex items-center space-x-1.5 truncate">
            <component :is="getStatusIcon(file.unstaged_status)" class="w-3.5 h-3.5" :class="getStatusColor(file.unstaged_status)" />
            <span class="truncate">{{ file.path }}</span>
            <span class="text-[9px] px-1 rounded bg-muted text-muted-foreground">{{ t(changelistStore.listFor(file.path).name) }}</span>
          </div>
          <div class="flex items-center space-x-1">
            <button
              @click="handleDiscardFile($event, file.path)"
              class="p-0.5 rounded hover:bg-rose-100 dark:hover:bg-destructive/20 text-rose-600 dark:text-rose-400 opacity-0 group-hover:opacity-100 transition"
              :title="t('Discard changes')"
            >
              <RotateCcw class="w-3 h-3" />
            </button>
            <button
              @click.stop="repoStore.stageFile(file.path)"
              class="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
              :title="t('Stage File')"
            >
              <Plus class="w-3 h-3" />
            </button>
          </div>
        </div>

        <button
          v-if="unstagedFiles.length < repoStore.statusSummary.unstaged_files.length"
          @click="showMore('unstaged')"
          class="w-full py-1 text-[10px] text-primary hover:bg-primary/10 rounded"
        >
          {{ t('Show more ({count} remaining)', { count: repoStore.statusSummary.unstaged_files.length - unstagedFiles.length }) }}
        </button>

        <!-- Untracked files -->
        <div
          v-for="file in untrackedFiles"
          :key="file.path"
          @click="diffStore.selectFile(file.path, false, repoStore.activeRepoPath)"
          class="flex items-center justify-between px-2 py-1 rounded-md cursor-pointer transition text-xs group"
          :class="diffStore.selectedFile === file.path && !diffStore.isStaged ? 'bg-primary/10 text-primary font-bold shadow-xs' : 'text-foreground hover:bg-secondary'"
        >
          <div class="flex items-center space-x-1.5 truncate">
            <FileQuestion class="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span class="truncate">{{ file.path }}</span>
            <span class="text-[9px] px-1 rounded bg-muted text-muted-foreground">{{ t(changelistStore.listFor(file.path).name) }}</span>
          </div>
          <div class="flex items-center space-x-1">
            <button
              @click="handleDiscardFile($event, file.path)"
              class="p-0.5 rounded hover:bg-rose-100 dark:hover:bg-destructive/20 text-rose-600 dark:text-rose-400 opacity-0 group-hover:opacity-100 transition"
              :title="t('Delete untracked file')"
            >
              <RotateCcw class="w-3 h-3" />
            </button>
            <button
              @click.stop="repoStore.stageFile(file.path)"
              class="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
              :title="t('Stage File')"
            >
              <Plus class="w-3 h-3" />
            </button>
          </div>
        </div>
        <button
          v-if="untrackedFiles.length < repoStore.statusSummary.untracked_files.length"
          @click="showMore('untracked')"
          class="w-full py-1 text-[10px] text-primary hover:bg-primary/10 rounded"
        >
          {{ t('Show more ({count} remaining)', { count: repoStore.statusSummary.untracked_files.length - untrackedFiles.length }) }}
        </button>
      </div>
    </div>
  </div>
</template>
