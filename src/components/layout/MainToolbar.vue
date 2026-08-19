<script setup lang="ts">
import { useRepoStore } from '@/stores/repo';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  GitBranch,
  GitMerge,
  Archive,
  RotateCcw,
} from 'lucide-vue-next';

const repoStore = useRepoStore();
</script>

<template>
  <div class="h-11 bg-card border-b border-border flex items-center justify-between px-3 text-xs select-none">
    <div class="flex items-center space-x-1">
      <!-- Fetch / Pull / Push -->
      <button class="flex items-center space-x-1.5 px-2.5 py-1.5 rounded hover:bg-accent text-foreground transition font-medium">
        <ArrowDownCircle class="w-4 h-4 text-sky-400" />
        <span>Pull</span>
        <span class="text-[10px] bg-sky-500/20 text-sky-300 px-1 rounded">0</span>
      </button>

      <button class="flex items-center space-x-1.5 px-2.5 py-1.5 rounded hover:bg-accent text-foreground transition font-medium">
        <ArrowUpCircle class="w-4 h-4 text-emerald-400" />
        <span>Push</span>
        <span class="text-[10px] bg-emerald-500/20 text-emerald-300 px-1 rounded">1</span>
      </button>

      <div class="h-4 w-[1px] bg-border mx-1"></div>

      <!-- Branch & Merge -->
      <button class="flex items-center space-x-1.5 px-2.5 py-1.5 rounded hover:bg-accent text-foreground transition font-medium">
        <GitBranch class="w-4 h-4 text-purple-400" />
        <span>Branch</span>
      </button>

      <button class="flex items-center space-x-1.5 px-2.5 py-1.5 rounded hover:bg-accent text-foreground transition font-medium">
        <GitMerge class="w-4 h-4 text-amber-400" />
        <span>Merge</span>
      </button>

      <div class="h-4 w-[1px] bg-border mx-1"></div>

      <!-- Stash -->
      <button class="flex items-center space-x-1.5 px-2.5 py-1.5 rounded hover:bg-accent text-foreground transition font-medium">
        <Archive class="w-4 h-4 text-orange-400" />
        <span>Stash</span>
      </button>

      <button class="flex items-center space-x-1.5 px-2.5 py-1.5 rounded hover:bg-accent text-foreground transition font-medium">
        <RotateCcw class="w-4 h-4 text-rose-400" />
        <span>Discard</span>
      </button>
    </div>

    <!-- Active Branch Badge -->
    <div class="flex items-center space-x-2">
      <div class="flex items-center space-x-1.5 px-2 py-1 rounded bg-secondary text-secondary-foreground font-mono text-[11px] border border-border">
        <GitBranch class="w-3.5 h-3.5 text-blue-400" />
        <span class="font-semibold">{{ repoStore.repoInfo?.head_branch || 'main' }}</span>
      </div>
    </div>
  </div>
</template>
