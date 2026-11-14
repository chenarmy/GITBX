<script setup lang="ts">
import { ref } from 'vue';
import { useDiffStore } from '@/stores/diff';
import { useRepoStore } from '@/stores/repo';
import { useNotificationStore } from '@/stores/notification';
import { useConfirmationStore } from '@/stores/confirmation';
import { useGitApi } from '@/composables/useGitApi';
import { buildPartialPatch } from '@/utils/partialPatch';
import {
  FileCode,
  Plus,
  Minus,
  RotateCcw,
  History,
  ListTree,
  Clock3,
} from 'lucide-vue-next';
import { useI18n } from '@/i18n';
import type { DiffHunk, DiffLine } from '@/types/diff';

const diffStore = useDiffStore();
const repoStore = useRepoStore();
const notification = useNotificationStore();
const confirmation = useConfirmationStore();
const gitApi = useGitApi();
const viewMode = ref<'unified' | 'split'>('unified');
const { t } = useI18n();

async function handleStageToggle() {
  if (!diffStore.selectedFile || !repoStore.activeRepoPath) return;
  try {
    if (diffStore.isStaged) {
      await repoStore.unstageFile(diffStore.selectedFile);
      diffStore.isStaged = false;
      notification.info(t('Unstaged File'), diffStore.selectedFile);
    } else {
      await repoStore.stageFile(diffStore.selectedFile);
      diffStore.isStaged = true;
      notification.success(t('Staged File'), diffStore.selectedFile);
    }
  } catch (error: any) {
    notification.error(t('Operation Failed'), error?.message || String(error));
  }
}

async function handleStageHunk(hunk: DiffHunk) {
  if (!diffStore.selectedFile || !repoStore.activeRepoPath) return;
  try {
    const wasStaged = diffStore.isStaged;
    const patch = buildPartialPatch(diffStore.selectedFile, hunk, { reverse: wasStaged });
    await gitApi.applyPartialPatch(repoStore.activeRepoPath, diffStore.selectedFile, patch, 'index');
    await refreshSelectedDiff(wasStaged);
    notification.success(t(wasStaged ? 'Hunk Unstaged' : 'Hunk Staged'), `${diffStore.selectedFile} (${hunk.header})`);
  } catch (error: any) {
    notification.error(t(diffStore.isStaged ? 'Unstage Failed' : 'Stage Failed'), error?.message || String(error));
  }
}

async function handleDiscardHunk(hunk: DiffHunk) {
  if (!diffStore.selectedFile || !repoStore.activeRepoPath) return;
  const approved = await confirmation.confirm({
    title: t('Discard Hunk'),
    message: t('Discard only the selected hunk from {file}?', { file: diffStore.selectedFile }),
    danger: true,
    confirmText: t('Discard Hunk'),
  });
  if (!approved) return;
  try {
    const patch = buildPartialPatch(diffStore.selectedFile, hunk, { reverse: true });
    await gitApi.applyPartialPatch(repoStore.activeRepoPath, diffStore.selectedFile, patch, 'workdir');
    await refreshSelectedDiff(false);
    notification.warning(t('Hunk Discarded'), `${diffStore.selectedFile} (${hunk.header})`);
  } catch (error: any) {
    notification.error(t('Discard Failed'), error?.message || String(error));
  }
}

async function handleStageLine(hunk: DiffHunk, lineIndex: number) {
  if (!diffStore.selectedFile || !repoStore.activeRepoPath) return;
  try {
    const wasStaged = diffStore.isStaged;
    const patch = buildPartialPatch(diffStore.selectedFile, hunk, {
      selectedLineIndex: lineIndex,
      reverse: wasStaged,
    });
    await gitApi.applyPartialPatch(repoStore.activeRepoPath, diffStore.selectedFile, patch, 'index');
    await refreshSelectedDiff(wasStaged);
    notification.success(t(wasStaged ? 'Line Unstaged' : 'Line Staged'), diffStore.selectedFile);
  } catch (error: any) {
    notification.error(t(diffStore.isStaged ? 'Unstage Failed' : 'Stage Failed'), error?.message || String(error));
  }
}

async function refreshSelectedDiff(staged: boolean) {
  const repoPath = repoStore.activeRepoPath;
  const filePath = diffStore.selectedFile;
  await repoStore.loadRepo(repoPath);
  if (filePath) await diffStore.selectFile(filePath, staged, repoPath);
}

function getSplitRows(hunk: DiffHunk) {
  const left: (DiffLine | null)[] = [];
  const right: (DiffLine | null)[] = [];

  let i = 0;
  while (i < hunk.lines.length) {
    const line = hunk.lines[i];
    if (line.line_type === 'Context') {
      left.push(line);
      right.push(line);
      i++;
    } else if (line.line_type === 'Deletion') {
      const deletions: DiffLine[] = [];
      while (i < hunk.lines.length && hunk.lines[i].line_type === 'Deletion') {
        deletions.push(hunk.lines[i]);
        i++;
      }
      const additions: DiffLine[] = [];
      while (i < hunk.lines.length && hunk.lines[i].line_type === 'Addition') {
        additions.push(hunk.lines[i]);
        i++;
      }
      const max = Math.max(deletions.length, additions.length);
      for (let k = 0; k < max; k++) {
        left.push(deletions[k] || null);
        right.push(additions[k] || null);
      }
    } else if (line.line_type === 'Addition') {
      left.push(null);
      right.push(line);
      i++;
    }
  }

  return left.map((l, idx) => ({ left: l, right: right[idx] }));
}
</script>

<template>
  <div class="dbx-diff h-full flex flex-col bg-card overflow-hidden text-xs">
    <!-- Diff Header -->
    <div class="dbx-pane-header h-9 border-b border-border flex items-center justify-between px-3.5 select-none gap-2">
      <div class="flex items-center gap-2 truncate min-w-0">
        <FileCode class="w-4 h-4 text-primary shrink-0" />
        <span class="font-semibold text-foreground truncate">{{ diffStore.selectedFile || t('No file selected') }}</span>

        <span v-if="diffStore.selectedFile" class="inline-flex items-center gap-1 text-[10px] font-mono font-semibold shrink-0 tabular-nums">
          <span class="arco-tag bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25">+{{ diffStore.activeDiff.additions }}</span>
          <span class="arco-tag bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25">-{{ diffStore.activeDiff.deletions }}</span>
        </span>
      </div>

      <!-- Action Buttons & Mode Switcher -->
      <div class="flex items-center gap-1.5 shrink-0">
        <button v-if="diffStore.selectedFile" class="arco-icon-btn arco-icon-btn-sm" :title="t('File History')" @click="diffStore.openFileInvestigation('history')"><History class="w-3.5 h-3.5" /></button>
        <button v-if="diffStore.selectedFile" class="arco-icon-btn arco-icon-btn-sm" :title="t('Blame')" @click="diffStore.openFileInvestigation('blame')"><ListTree class="w-3.5 h-3.5" /></button>
        <button v-if="diffStore.selectedFile" class="arco-icon-btn arco-icon-btn-sm" :title="t('Local History')" @click="diffStore.isLocalHistoryOpen = true"><Clock3 class="w-3.5 h-3.5" /></button>
        <button
          v-if="diffStore.selectedFile && !diffStore.commitId && !diffStore.branchComparison"
          @click="handleStageToggle"
          class="arco-btn arco-btn-sm cursor-pointer"
          :class="diffStore.isStaged ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/25' : 'bg-primary/10 text-primary border border-primary/25 hover:bg-primary/20'"
        >
          <Minus v-if="diffStore.isStaged" class="w-3 h-3" />
          <Plus v-else class="w-3 h-3" />
          <span>{{ diffStore.isStaged ? t('Unstage File') : t('Stage File') }}</span>
        </button>

        <div class="arco-segmented">
          <button
            @click="viewMode = 'unified'"
            class="arco-segmented-item py-0.5 px-2 cursor-pointer"
            :class="{ 'arco-segmented-item-active text-primary': viewMode === 'unified' }"
          >
            {{ t('Unified') }}
          </button>
          <button
            @click="viewMode = 'split'"
            class="arco-segmented-item py-0.5 px-2 cursor-pointer"
            :class="{ 'arco-segmented-item-active text-primary': viewMode === 'split' }"
          >
            {{ t('Split') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Diff Content Body -->
    <div class="flex-1 overflow-y-auto font-mono text-[12px] bg-card">
      <div v-if="!diffStore.selectedFile" class="p-8 text-center text-muted-foreground">
        {{ t('Select a changed file or a commit node above to view diff changes.') }}
      </div>

      <!-- 1. Unified Diff View -->
      <div v-else-if="viewMode === 'unified'">
        <div v-for="(hunk, hIdx) in diffStore.activeDiff.hunks" :key="hIdx" class="border-b border-border/60">
          <!-- Hunk Header Bar -->
          <div class="bg-muted/70 text-muted-foreground px-3 py-1 flex items-center justify-between select-none text-[11px] font-semibold sticky top-0 z-10 backdrop-blur-sm border-b border-border/50">
            <span>{{ hunk.header }}</span>
            <div v-if="!diffStore.commitId && !diffStore.branchComparison" class="flex items-center gap-1.5">
              <button
                @click="handleStageHunk(hunk)"
                class="arco-btn arco-btn-text arco-btn-sm h-5 px-1.5 text-[10px] hover:text-emerald-500 cursor-pointer"
              >
                <Minus v-if="diffStore.isStaged" class="w-3 h-3" />
                <Plus v-else class="w-3 h-3" />
                <span>{{ t(diffStore.isStaged ? 'Unstage Hunk' : 'Stage Hunk') }}</span>
              </button>
              <button
                v-if="!diffStore.isStaged"
                @click="handleDiscardHunk(hunk)"
                class="arco-btn arco-btn-text arco-btn-sm h-5 px-1.5 text-[10px] hover:text-destructive cursor-pointer"
              >
                <RotateCcw class="w-3 h-3" />
                <span>{{ t('Discard Hunk') }}</span>
              </button>
            </div>
          </div>

          <!-- Hunk Lines -->
          <div class="divide-y divide-border/20">
            <div
              v-for="(line, lIdx) in hunk.lines"
              :key="lIdx"
              class="flex items-center group transition-colors"
              :class="{
                'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300': line.line_type === 'Addition',
                'bg-rose-500/10 text-rose-800 dark:text-rose-300': line.line_type === 'Deletion',
                'text-foreground': line.line_type === 'Context',
              }"
            >
              <!-- Line numbers -->
              <div class="w-10 text-right pr-2 py-0.5 select-none text-muted-foreground/60 text-[10px] bg-muted/25 tabular-nums">
                {{ line.old_lineno || '' }}
              </div>
              <div class="w-10 text-right pr-2 py-0.5 select-none text-muted-foreground/60 text-[10px] bg-muted/25 border-r border-border/70 tabular-nums">
                {{ line.new_lineno || '' }}
              </div>

              <!-- Prefix symbol (+ / - / space) -->
              <div class="w-5 text-center font-bold select-none">
                <span v-if="line.line_type === 'Addition'" class="text-emerald-500">+</span>
                <span v-else-if="line.line_type === 'Deletion'" class="text-rose-500">-</span>
                <span v-else>&nbsp;</span>
              </div>

              <!-- Line Content -->
              <div class="flex-1 px-1 py-0.5 whitespace-pre overflow-x-auto">
                {{ line.content }}
              </div>

              <!-- Line Action Button -->
              <div v-if="!diffStore.commitId && !diffStore.branchComparison && line.line_type !== 'Context'" class="hidden group-hover:flex items-center gap-1 px-2 select-none">
                <button
                  @click="handleStageLine(hunk, lIdx)"
                  class="arco-btn arco-btn-outline arco-btn-sm h-5 px-2 text-[10px] cursor-pointer"
                  :title="t(diffStore.isStaged ? 'Unstage this line' : 'Stage this line')"
                >
                  {{ t(diffStore.isStaged ? 'Unstage Line' : 'Stage Line') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. Split (Side-by-Side) Diff View -->
      <div v-else-if="viewMode === 'split'">
        <div v-for="(hunk, hIdx) in diffStore.activeDiff.hunks" :key="hIdx" class="border-b border-border/60">
          <!-- Hunk Header Bar -->
          <div class="bg-muted/70 text-muted-foreground px-3 py-1 flex items-center justify-between select-none text-[11px] font-semibold sticky top-0 z-10 backdrop-blur-sm border-b border-border/50">
            <span>{{ hunk.header }}</span>
            <div v-if="!diffStore.commitId && !diffStore.branchComparison" class="flex items-center gap-1.5">
              <button
                @click="handleStageHunk(hunk)"
                class="arco-btn arco-btn-text arco-btn-sm h-5 px-1.5 text-[10px] hover:text-emerald-500 cursor-pointer"
              >
                <Minus v-if="diffStore.isStaged" class="w-3 h-3" />
                <Plus v-else class="w-3 h-3" />
                <span>{{ t(diffStore.isStaged ? 'Unstage Hunk' : 'Stage Hunk') }}</span>
              </button>
              <button
                v-if="!diffStore.isStaged"
                @click="handleDiscardHunk(hunk)"
                class="arco-btn arco-btn-text arco-btn-sm h-5 px-1.5 text-[10px] hover:text-destructive cursor-pointer"
              >
                <RotateCcw class="w-3 h-3" />
                <span>{{ t('Discard Hunk') }}</span>
              </button>
            </div>
          </div>

          <!-- Split Rows -->
          <div class="divide-y divide-border/20">
            <div
              v-for="(row, rIdx) in getSplitRows(hunk)"
              :key="rIdx"
              class="grid grid-cols-2 divide-x divide-border/70"
            >
              <!-- Left: Old Side -->
              <div
                class="flex items-center min-w-0"
                :class="row.left?.line_type === 'Deletion' ? 'bg-rose-500/10 text-rose-800 dark:text-rose-300' : 'text-foreground'"
              >
                <div class="w-10 text-right pr-2 py-0.5 select-none text-muted-foreground/60 text-[10px] bg-muted/25 border-r border-border/70 shrink-0 tabular-nums">
                  {{ row.left?.old_lineno || '' }}
                </div>
                <div class="w-4 text-center font-bold select-none shrink-0">
                  <span v-if="row.left?.line_type === 'Deletion'" class="text-rose-500">-</span>
                  <span v-else>&nbsp;</span>
                </div>
                <div class="flex-1 px-1 py-0.5 whitespace-pre overflow-x-auto">
                  {{ row.left?.content || '' }}
                </div>
              </div>

              <!-- Right: New Side -->
              <div
                class="flex items-center min-w-0"
                :class="row.right?.line_type === 'Addition' ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' : 'text-foreground'"
              >
                <div class="w-10 text-right pr-2 py-0.5 select-none text-muted-foreground/60 text-[10px] bg-muted/25 border-r border-border/70 shrink-0 tabular-nums">
                  {{ row.right?.new_lineno || '' }}
                </div>
                <div class="w-4 text-center font-bold select-none shrink-0">
                  <span v-if="row.right?.line_type === 'Addition'" class="text-emerald-500">+</span>
                  <span v-else>&nbsp;</span>
                </div>
                <div class="flex-1 px-1 py-0.5 whitespace-pre overflow-x-auto">
                  {{ row.right?.content || '' }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
