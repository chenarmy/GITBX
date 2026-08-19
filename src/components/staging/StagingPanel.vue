<script setup lang="ts">
import { useRepoStore } from '@/stores/repo';
import { useDiffStore } from '@/stores/diff';
import {
  Plus,
  Minus,
  FileQuestion,
  FilePlus,
  FileMinus,
  FileEdit,
} from 'lucide-vue-next';

const repoStore = useRepoStore();
const diffStore = useDiffStore();

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
      return 'text-emerald-400';
    case 'Deleted':
      return 'text-rose-400';
    case 'Untracked':
      return 'text-sky-400';
    default:
      return 'text-amber-400';
  }
}
</script>

<template>
  <div class="h-full flex flex-col bg-card border-r border-border text-xs select-none overflow-hidden">
    <!-- Staged Changes Section -->
    <div class="flex-1 flex flex-col min-h-0 border-b border-border">
      <div class="h-7 bg-muted/40 px-2.5 flex items-center justify-between font-semibold text-muted-foreground border-b border-border/40">
        <div class="flex items-center space-x-1.5">
          <span>Staged Changes</span>
          <span class="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">
            {{ repoStore.statusSummary.staged_files.length }}
          </span>
        </div>
        <button
          v-if="repoStore.statusSummary.staged_files.length > 0"
          class="text-[11px] text-muted-foreground hover:text-foreground flex items-center space-x-0.5"
          title="Unstage All"
        >
          <Minus class="w-3 h-3" />
          <span>Unstage All</span>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-1 space-y-0.5">
        <div
          v-for="file in repoStore.statusSummary.staged_files"
          :key="file.path"
          @click="diffStore.selectFile(file.path)"
          class="flex items-center justify-between px-2 py-1 rounded cursor-pointer transition text-xs"
          :class="diffStore.selectedFile === file.path ? 'bg-primary/15 text-foreground font-medium' : 'text-muted-foreground hover:bg-accent hover:text-foreground'"
        >
          <div class="flex items-center space-x-1.5 truncate">
            <component :is="getStatusIcon(file.staged_status)" class="w-3.5 h-3.5" :class="getStatusColor(file.staged_status)" />
            <span class="truncate">{{ file.path }}</span>
          </div>
          <button
            @click.stop="repoStore.unstageFile(file.path)"
            class="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Unstage File"
          >
            <Minus class="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>

    <!-- Unstaged Changes & Untracked Files Section -->
    <div class="flex-1 flex flex-col min-h-0">
      <div class="h-7 bg-muted/40 px-2.5 flex items-center justify-between font-semibold text-muted-foreground border-b border-border/40">
        <div class="flex items-center space-x-1.5">
          <span>Changes</span>
          <span class="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 font-bold text-[10px]">
            {{ repoStore.statusSummary.unstaged_files.length + repoStore.statusSummary.untracked_files.length }}
          </span>
        </div>
        <button
          class="text-[11px] text-muted-foreground hover:text-foreground flex items-center space-x-0.5"
          title="Stage All"
        >
          <Plus class="w-3 h-3" />
          <span>Stage All</span>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-1 space-y-0.5">
        <!-- Unstaged modified files -->
        <div
          v-for="file in repoStore.statusSummary.unstaged_files"
          :key="file.path"
          @click="diffStore.selectFile(file.path)"
          class="flex items-center justify-between px-2 py-1 rounded cursor-pointer transition text-xs"
          :class="diffStore.selectedFile === file.path ? 'bg-primary/15 text-foreground font-medium' : 'text-muted-foreground hover:bg-accent hover:text-foreground'"
        >
          <div class="flex items-center space-x-1.5 truncate">
            <component :is="getStatusIcon(file.unstaged_status)" class="w-3.5 h-3.5" :class="getStatusColor(file.unstaged_status)" />
            <span class="truncate">{{ file.path }}</span>
          </div>
          <button
            @click.stop="repoStore.stageFile(file.path)"
            class="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Stage File"
          >
            <Plus class="w-3 h-3" />
          </button>
        </div>

        <!-- Untracked files -->
        <div
          v-for="file in repoStore.statusSummary.untracked_files"
          :key="file.path"
          @click="diffStore.selectFile(file.path)"
          class="flex items-center justify-between px-2 py-1 rounded cursor-pointer transition text-xs"
          :class="diffStore.selectedFile === file.path ? 'bg-primary/15 text-foreground font-medium' : 'text-muted-foreground hover:bg-accent hover:text-foreground'"
        >
          <div class="flex items-center space-x-1.5 truncate">
            <FileQuestion class="w-3.5 h-3.5 text-sky-400" />
            <span class="truncate">{{ file.path }}</span>
          </div>
          <button
            @click.stop="repoStore.stageFile(file.path)"
            class="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Stage File"
          >
            <Plus class="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
