<script setup lang="ts">
import { ref } from 'vue';
import { useDiffStore } from '@/stores/diff';
import { useRepoStore } from '@/stores/repo';
import { useNotificationStore } from '@/stores/notification';
import {
  FileCode,
  Plus,
  Minus,
  RotateCcw,
} from 'lucide-vue-next';
import { useI18n } from '@/i18n';
import type { DiffHunk, DiffLine } from '@/types/diff';

const diffStore = useDiffStore();
const repoStore = useRepoStore();
const notification = useNotificationStore();
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
    await repoStore.stageFile(diffStore.selectedFile);
    diffStore.isStaged = true;
    notification.success(t('Hunk Staged'), `${diffStore.selectedFile} (${hunk.header})`);
  } catch (error: any) {
    notification.error(t('Stage Failed'), error?.message || String(error));
  }
}

async function handleDiscardHunk(hunk: DiffHunk) {
  if (!diffStore.selectedFile || !repoStore.activeRepoPath) return;
  try {
    await repoStore.discardFile(diffStore.selectedFile);
    notification.warning(t('Hunk Discarded'), `${diffStore.selectedFile} (${hunk.header})`);
  } catch (error: any) {
    notification.error(t('Discard Failed'), error?.message || String(error));
  }
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
    <div class="dbx-pane-header h-8 bg-muted/40 border-b border-border flex items-center justify-between px-3 select-none">
      <div class="flex items-center space-x-2 truncate min-w-0">
        <FileCode class="w-4 h-4 text-primary shrink-0" />
        <span class="font-bold text-foreground truncate">{{ diffStore.selectedFile || t('No file selected') }}</span>

        <span v-if="diffStore.selectedFile" class="inline-flex items-center space-x-1 text-[11px] font-mono font-bold shrink-0">
          <span class="text-emerald-600 dark:text-emerald-400">+{{ diffStore.activeDiff.additions }}</span>
          <span class="text-rose-600 dark:text-rose-400">-{{ diffStore.activeDiff.deletions }}</span>
        </span>
      </div>

      <!-- Action Buttons & Mode Switcher -->
      <div class="flex items-center space-x-2 shrink-0">
        <button
          v-if="diffStore.selectedFile && !diffStore.commitId"
          @click="handleStageToggle"
          class="px-2 py-0.5 rounded text-[11px] font-semibold flex items-center space-x-1 transition active:scale-95 cursor-pointer"
          :class="diffStore.isStaged ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 hover:bg-amber-500/30' : 'bg-primary/10 text-primary hover:bg-primary/20'"
        >
          <Minus v-if="diffStore.isStaged" class="w-3 h-3" />
          <Plus v-else class="w-3 h-3" />
          <span>{{ diffStore.isStaged ? t('Unstage File') : t('Stage File') }}</span>
        </button>

        <div class="flex items-center bg-secondary/80 rounded-md p-0.5 border border-border shadow-2xs">
          <button
            @click="viewMode = 'unified'"
            class="px-2 py-0.5 rounded text-[11px] font-semibold transition active:scale-95 cursor-pointer"
            :class="viewMode === 'unified' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'"
          >
            {{ t('Unified') }}
          </button>
          <button
            @click="viewMode = 'split'"
            class="px-2 py-0.5 rounded text-[11px] font-semibold transition active:scale-95 cursor-pointer"
            :class="viewMode === 'split' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'"
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
          <div class="bg-muted/60 text-muted-foreground px-3 py-1 flex items-center justify-between select-none text-[11px] font-semibold sticky top-0 z-10 backdrop-blur-sm">
            <span>{{ hunk.header }}</span>
            <div v-if="!diffStore.commitId" class="flex items-center space-x-2">
              <button
                @click="handleStageHunk(hunk)"
                class="hover:text-emerald-600 dark:hover:text-emerald-400 transition flex items-center space-x-1 cursor-pointer"
              >
                <Plus class="w-3 h-3" />
                <span>{{ t('Stage Hunk') }}</span>
              </button>
              <button
                @click="handleDiscardHunk(hunk)"
                class="hover:text-rose-600 dark:hover:text-rose-400 transition flex items-center space-x-1 cursor-pointer"
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
              class="flex items-center group transition"
              :class="{
                'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-medium': line.line_type === 'Addition',
                'bg-rose-500/10 text-rose-800 dark:text-rose-300 font-medium': line.line_type === 'Deletion',
                'text-foreground': line.line_type === 'Context',
              }"
            >
              <!-- Line numbers -->
              <div class="w-10 text-right pr-2 py-0.5 select-none text-muted-foreground/60 text-[10px] bg-muted/20">
                {{ line.old_lineno || '' }}
              </div>
              <div class="w-10 text-right pr-2 py-0.5 select-none text-muted-foreground/60 text-[10px] bg-muted/20 border-r border-border">
                {{ line.new_lineno || '' }}
              </div>

              <!-- Prefix symbol (+ / - / space) -->
              <div class="w-5 text-center font-bold select-none">
                <span v-if="line.line_type === 'Addition'" class="text-emerald-600 dark:text-emerald-400">+</span>
                <span v-else-if="line.line_type === 'Deletion'" class="text-rose-600 dark:text-rose-400">-</span>
                <span v-else>&nbsp;</span>
              </div>

              <!-- Line Content -->
              <div class="flex-1 px-1 py-0.5 whitespace-pre overflow-x-auto">
                {{ line.content }}
              </div>

              <!-- Line Action Button -->
              <div v-if="!diffStore.commitId" class="hidden group-hover:flex items-center space-x-1 px-2 select-none">
                <button
                  @click="handleStageHunk(hunk)"
                  class="px-1.5 py-0.5 rounded bg-secondary hover:bg-muted text-foreground text-[10px] font-semibold shadow-2xs cursor-pointer"
                  :title="t('Stage this line')"
                >
                  {{ t('Stage Line') }}
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
          <div class="bg-muted/60 text-muted-foreground px-3 py-1 flex items-center justify-between select-none text-[11px] font-semibold sticky top-0 z-10 backdrop-blur-sm">
            <span>{{ hunk.header }}</span>
            <div v-if="!diffStore.commitId" class="flex items-center space-x-2">
              <button
                @click="handleStageHunk(hunk)"
                class="hover:text-emerald-600 dark:hover:text-emerald-400 transition flex items-center space-x-1 cursor-pointer"
              >
                <Plus class="w-3 h-3" />
                <span>{{ t('Stage Hunk') }}</span>
              </button>
              <button
                @click="handleDiscardHunk(hunk)"
                class="hover:text-rose-600 dark:hover:text-rose-400 transition flex items-center space-x-1 cursor-pointer"
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
              class="grid grid-cols-2 divide-x divide-border"
            >
              <!-- Left: Old Side -->
              <div
                class="flex items-center min-w-0"
                :class="row.left?.line_type === 'Deletion' ? 'bg-rose-500/10 text-rose-800 dark:text-rose-300' : 'text-foreground'"
              >
                <div class="w-10 text-right pr-2 py-0.5 select-none text-muted-foreground/60 text-[10px] bg-muted/20 border-r border-border shrink-0">
                  {{ row.left?.old_lineno || '' }}
                </div>
                <div class="w-4 text-center font-bold select-none shrink-0">
                  <span v-if="row.left?.line_type === 'Deletion'" class="text-rose-600 dark:text-rose-400">-</span>
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
                <div class="w-10 text-right pr-2 py-0.5 select-none text-muted-foreground/60 text-[10px] bg-muted/20 border-r border-border shrink-0">
                  {{ row.right?.new_lineno || '' }}
                </div>
                <div class="w-4 text-center font-bold select-none shrink-0">
                  <span v-if="row.right?.line_type === 'Addition'" class="text-emerald-600 dark:text-emerald-400">+</span>
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
