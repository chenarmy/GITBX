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
  FolderTree,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  List as ListIcon,
  Layers,
} from 'lucide-vue-next';
import { useI18n } from '@/i18n';
import { useChangelistStore } from '@/stores/changelist';
import { useNotificationStore } from '@/stores/notification';
import type { FileStatusItem } from '@/types/git';

const repoStore = useRepoStore();
const diffStore = useDiffStore();
const confirmation = useConfirmationStore();
const { t } = useI18n();
const changelistStore = useChangelistStore();
const notification = useNotificationStore();

// Keep the full status in the store, but progressively render large lists so
// repositories with thousands of changes do not freeze the webview.
const FILE_PAGE_SIZE = 200;
const changeLimit = ref(FILE_PAGE_SIZE);
const conflictLimit = ref(FILE_PAGE_SIZE);
const commitFileLimit = ref(FILE_PAGE_SIZE);
const branchFileLimit = ref(FILE_PAGE_SIZE);
const collapsedDirectories = ref(new Set<string>());
const conflictedFiles = computed(() => repoStore.statusSummary.conflicted_files.slice(0, conflictLimit.value));
const commitFiles = computed(() => repoStore.selectedCommitFiles.slice(0, commitFileLimit.value));
const branchFiles = computed(() => repoStore.branchComparisonFiles.slice(0, branchFileLimit.value));
const changeView = ref<'grouped' | 'flat'>((localStorage.getItem('gitbx_change_view') as 'grouped' | 'flat') || 'grouped');

const workingFiles = computed(() => {
  const files = new Map<string, FileStatusItem>();
  for (const file of [
    ...repoStore.statusSummary.staged_files,
    ...repoStore.statusSummary.unstaged_files,
    ...repoStore.statusSummary.untracked_files,
  ]) {
    const existing = files.get(file.path);
    if (!existing) {
      files.set(file.path, { ...file });
      continue;
    }
    files.set(file.path, {
      ...existing,
      ...file,
      staged_status: file.staged_status !== 'Unmodified' ? file.staged_status : existing.staged_status,
      unstaged_status: file.unstaged_status !== 'Unmodified' ? file.unstaged_status : existing.unstaged_status,
      is_staged: existing.is_staged || file.is_staged,
    });
  }
  return [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
});
const visibleWorkingFiles = computed(() => workingFiles.value.slice(0, changeLimit.value));

interface ChangeTreeNode {
  name: string;
  path: string;
  directories: ChangeTreeNode[];
  files: FileStatusItem[];
  descendantFiles: FileStatusItem[];
}

type ChangeTreeRow =
  | { type: 'directory'; depth: number; node: ChangeTreeNode }
  | { type: 'file'; depth: number; file: FileStatusItem };

const changeTree = computed<ChangeTreeNode>(() => {
  type MutableTreeNode = Omit<ChangeTreeNode, 'directories'> & { directoryMap: Map<string, MutableTreeNode> };
  const root: MutableTreeNode = { name: '', path: '', directoryMap: new Map(), files: [], descendantFiles: [] };

  for (const file of workingFiles.value) {
    const parts = file.path.replace(/\\/g, '/').split('/').filter(Boolean);
    let current = root;
    current.descendantFiles.push(file);
    for (const part of parts.slice(0, -1)) {
      const path = current.path ? `${current.path}/${part}` : part;
      let child = current.directoryMap.get(part);
      if (!child) {
        child = { name: part, path, directoryMap: new Map(), files: [], descendantFiles: [] };
        current.directoryMap.set(part, child);
      }
      child.descendantFiles.push(file);
      current = child;
    }
    current.files.push(file);
  }

  const finalize = (node: MutableTreeNode): ChangeTreeNode => ({
    name: node.name,
    path: node.path,
    directories: [...node.directoryMap.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(finalize),
    files: [...node.files].sort((a, b) => fileName(a.path).localeCompare(fileName(b.path))),
    descendantFiles: node.descendantFiles,
  });
  return finalize(root);
});

const visibleTreeRows = computed<ChangeTreeRow[]>(() => {
  const rows: ChangeTreeRow[] = [];
  let renderedFiles = 0;

  const visit = (node: ChangeTreeNode, depth: number) => {
    for (const directory of node.directories) {
      if (renderedFiles >= changeLimit.value) return;
      rows.push({ type: 'directory', depth, node: directory });
      if (!collapsedDirectories.value.has(directory.path)) visit(directory, depth + 1);
    }
    for (const file of node.files) {
      if (renderedFiles >= changeLimit.value) return;
      rows.push({ type: 'file', depth, file });
      renderedFiles += 1;
    }
  };

  visit(changeTree.value, 0);
  return rows;
});
const selectedCount = computed(() => repoStore.selectedChangePaths.length);
const allChangesSelected = computed(() => workingFiles.value.length > 0 && selectedCount.value === workingFiles.value.length);
const operationsLocked = computed(() => Boolean(
  repoStore.statusSummary.conflicted_files.length
  || repoStore.repoInfo?.is_merging
  || repoStore.repoInfo?.is_rebasing
  || repoStore.repoInfo?.is_cherry_picking
  || repoStore.repoInfo?.is_reverting,
));

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
    changeLimit.value = FILE_PAGE_SIZE;
    conflictLimit.value = FILE_PAGE_SIZE;
    commitFileLimit.value = FILE_PAGE_SIZE;
    branchFileLimit.value = FILE_PAGE_SIZE;
  },
);

function showMore(section: 'changes' | 'conflict' | 'commit' | 'branch') {
  const limits = {
    changes: changeLimit,
    conflict: conflictLimit,
    commit: commitFileLimit,
    branch: branchFileLimit,
  };
  limits[section].value += FILE_PAGE_SIZE;
}

function setChangeView(view: 'grouped' | 'flat') {
  changeView.value = view;
  localStorage.setItem('gitbx_change_view', view);
}

function toggleDirectory(path: string) {
  const next = new Set(collapsedDirectories.value);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  collapsedDirectories.value = next;
}

function directorySelectionState(files: FileStatusItem[]) {
  const selected = new Set(repoStore.selectedChangePaths);
  const selectedInDirectory = files.reduce((count, file) => count + Number(selected.has(file.path)), 0);
  if (selectedInDirectory === 0) return 'none';
  if (selectedInDirectory === files.length) return 'all';
  return 'partial';
}

function toggleDirectorySelection(files: FileStatusItem[]) {
  const selected = new Set(repoStore.selectedChangePaths);
  const shouldSelect = files.some((file) => !selected.has(file.path));
  for (const file of files) {
    if (shouldSelect) selected.add(file.path);
    else selected.delete(file.path);
  }
  repoStore.selectedChangePaths = [...selected];
}

function fileName(filePath: string) {
  return filePath.replace(/\\/g, '/').split('/').pop() || filePath;
}

function fileStatus(file: FileStatusItem) {
  return file.unstaged_status !== 'Unmodified' ? file.unstaged_status : file.staged_status;
}

function showStagedDiff(file: FileStatusItem) {
  return file.is_staged && file.unstaged_status === 'Unmodified';
}

function selectWorkingFile(file: FileStatusItem) {
  void diffStore.selectFile(file.path, showStagedDiff(file), repoStore.activeRepoPath);
}

function toggleAllChanges() {
  if (allChangesSelected.value) repoStore.clearChangeSelection();
  else repoStore.selectAllChanges();
}

async function handleStageSelected() {
  if (!selectedCount.value) return;
  await repoStore.stageFiles(repoStore.selectedChangePaths);
  notification.success(t('Changes Staged'), t('{count} selected files were staged.', { count: selectedCount.value }));
}

async function handleUnstageSelected() {
  const staged = repoStore.statusSummary.staged_files
    .map((file) => file.path)
    .filter((path) => repoStore.selectedChangePaths.includes(path));
  if (!staged.length) return;
  await repoStore.unstageFiles(staged);
  notification.success(t('Changes Unstaged'), t('{count} selected files were unstaged.', { count: staged.length }));
}

async function handleStashSelected() {
  if (!selectedCount.value) return;
  const count = selectedCount.value;
  await repoStore.createShelf(t('Selected changes'), repoStore.selectedChangePaths);
  notification.success(t('Stash Created'), t('{count} selected files were stashed.', { count }));
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

    <!-- Unified working tree changes (normal working tree) -->
    <div v-else class="flex-1 flex flex-col min-h-0">
      <div class="dbx-pane-header min-h-8 bg-muted/40 px-2 flex items-center justify-between gap-2 font-bold text-muted-foreground border-b border-border">
        <label class="flex items-center gap-1.5 min-w-0 cursor-pointer">
          <input
            type="checkbox"
            :checked="allChangesSelected"
            :disabled="workingFiles.length === 0"
            @change="toggleAllChanges"
          />
          <span>{{ t('Changes') }}</span>
          <span class="px-1.5 rounded text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
            {{ workingFiles.length }}
          </span>
          <span class="truncate text-[10px] font-normal">{{ t('{count} selected', { count: selectedCount }) }}</span>
        </label>
        <div class="flex items-center shrink-0 border border-border rounded p-0.5 bg-background/70">
          <button
            class="p-1 rounded"
            :class="changeView === 'grouped' ? 'bg-accent text-primary' : 'hover:bg-accent'"
            :title="t('Group by Directory')"
            @click="setChangeView('grouped')"
          ><FolderTree class="w-3.5 h-3.5" /></button>
          <button
            class="p-1 rounded"
            :class="changeView === 'flat' ? 'bg-accent text-primary' : 'hover:bg-accent'"
            :title="t('Flat View')"
            @click="setChangeView('flat')"
          ><ListIcon class="w-3.5 h-3.5" /></button>
        </div>
      </div>

      <div class="flex items-center gap-1 px-2 py-1 border-b border-border bg-card">
        <button class="change-action" :disabled="!selectedCount || operationsLocked" @click="handleStageSelected">
          <Plus class="w-3 h-3" />{{ t('Add') }}
        </button>
        <button class="change-action" :disabled="!selectedCount || operationsLocked" @click="handleUnstageSelected">
          <Minus class="w-3 h-3" />{{ t('Unstage') }}
        </button>
        <button class="change-action" :disabled="!selectedCount || operationsLocked" @click="handleStashSelected">
          <Layers class="w-3 h-3" />{{ t('Stash Selected') }}
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-1 space-y-0.5">
        <template v-if="changeView === 'grouped'">
          <template v-for="row in visibleTreeRows" :key="row.type === 'directory' ? `directory:${row.node.path}` : `file:${row.file.path}`">
            <div
              v-if="row.type === 'directory'"
              class="tree-directory-row"
              :style="{ paddingLeft: `${0.4 + row.depth * 0.85}rem` }"
              @click="toggleDirectory(row.node.path)"
            >
              <component :is="collapsedDirectories.has(row.node.path) ? ChevronRight : ChevronDown" class="w-3 h-3 shrink-0" />
              <input
                type="checkbox"
                :checked="directorySelectionState(row.node.descendantFiles) === 'all'"
                :indeterminate="directorySelectionState(row.node.descendantFiles) === 'partial'"
                @click.stop="toggleDirectorySelection(row.node.descendantFiles)"
              />
              <component :is="collapsedDirectories.has(row.node.path) ? Folder : FolderOpen" class="w-3.5 h-3.5 shrink-0 text-amber-500" />
              <span class="truncate">{{ row.node.name }}</span>
              <span class="ml-auto text-[9px] font-normal text-muted-foreground">{{ row.node.descendantFiles.length }}</span>
            </div>
            <div
              v-else
              class="change-row"
              :style="{ paddingLeft: `${1.65 + row.depth * 0.85}rem` }"
              :class="diffStore.selectedFile === row.file.path && diffStore.isStaged === showStagedDiff(row.file) ? 'bg-primary/10 text-primary font-bold shadow-xs' : 'text-foreground hover:bg-secondary'"
              @click="selectWorkingFile(row.file)"
            >
              <input type="checkbox" :checked="repoStore.selectedChangePaths.includes(row.file.path)" @click.stop="repoStore.toggleChangeSelection(row.file.path)" />
              <component :is="getStatusIcon(fileStatus(row.file))" class="w-3.5 h-3.5 shrink-0" :class="getStatusColor(fileStatus(row.file))" />
              <span class="truncate">{{ fileName(row.file.path) }}</span>
              <span v-if="row.file.is_staged" class="status-badge text-emerald-700 dark:text-emerald-300">{{ t('Staged') }}</span>
              <span class="status-badge">{{ t(changelistStore.listFor(row.file.path).name) }}</span>
              <button class="ml-auto p-0.5 text-rose-500 opacity-0 group-hover:opacity-100" :title="t('Discard changes')" @click="handleDiscardFile($event, row.file.path)"><RotateCcw class="w-3 h-3" /></button>
            </div>
          </template>
        </template>

        <template v-else>
          <div
            v-for="file in visibleWorkingFiles"
            :key="file.path"
            class="change-row"
            :class="diffStore.selectedFile === file.path && diffStore.isStaged === showStagedDiff(file) ? 'bg-primary/10 text-primary font-bold shadow-xs' : 'text-foreground hover:bg-secondary'"
            @click="selectWorkingFile(file)"
          >
            <input type="checkbox" :checked="repoStore.selectedChangePaths.includes(file.path)" @click.stop="repoStore.toggleChangeSelection(file.path)" />
            <component :is="getStatusIcon(fileStatus(file))" class="w-3.5 h-3.5 shrink-0" :class="getStatusColor(fileStatus(file))" />
            <span class="truncate">{{ file.path }}</span>
            <span v-if="file.is_staged" class="status-badge text-emerald-700 dark:text-emerald-300">{{ t('Staged') }}</span>
            <span class="status-badge">{{ t(changelistStore.listFor(file.path).name) }}</span>
            <button class="ml-auto p-0.5 text-rose-500 opacity-0 group-hover:opacity-100" :title="t('Discard changes')" @click="handleDiscardFile($event, file.path)"><RotateCcw class="w-3 h-3" /></button>
          </div>
        </template>

        <div v-if="workingFiles.length === 0" class="p-8 text-center text-muted-foreground">{{ t('Working tree clean') }}</div>
        <button v-if="visibleWorkingFiles.length < workingFiles.length" class="w-full py-1 text-[10px] text-primary hover:bg-primary/10 rounded" @click="showMore('changes')">
          {{ t('Show more ({count} remaining)', { count: workingFiles.length - visibleWorkingFiles.length }) }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.change-action {
  align-items: center;
  border: 1px solid hsl(var(--border));
  border-radius: 0.25rem;
  display: inline-flex;
  gap: 0.25rem;
  padding: 0.2rem 0.45rem;
}
.change-action:hover:not(:disabled) { background: hsl(var(--accent)); color: hsl(var(--accent-foreground)); }
.change-action:disabled { cursor: not-allowed; opacity: 0.4; }
.change-row { align-items: center; border-radius: 0.375rem; cursor: pointer; display: flex; gap: 0.375rem; min-width: 0; padding: 0.3rem 0.5rem; }
.change-row:hover button { opacity: 1; }
.tree-directory-row { align-items: center; background: hsl(var(--muted) / 0.3); border-radius: 0.375rem; color: hsl(var(--muted-foreground)); cursor: pointer; display: flex; font-size: 10px; font-weight: 600; gap: 0.3rem; min-width: 0; padding-bottom: 0.25rem; padding-right: 0.5rem; padding-top: 0.25rem; }
.tree-directory-row:hover { background: hsl(var(--muted) / 0.65); color: hsl(var(--foreground)); }
.status-badge { background: hsl(var(--muted)); border-radius: 0.2rem; flex-shrink: 0; font-size: 9px; padding: 0 0.25rem; }
</style>
