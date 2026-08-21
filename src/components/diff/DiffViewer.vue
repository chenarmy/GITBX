<script setup lang="ts">
import { ref } from 'vue';
import { useDiffStore } from '@/stores/diff';
import {
  FileCode,
  Plus,
  RotateCcw,
} from 'lucide-vue-next';

const diffStore = useDiffStore();
const viewMode = ref<'unified' | 'split'>('unified');
</script>

<template>
  <div class="dbx-diff h-full flex flex-col bg-card overflow-hidden text-xs">
    <!-- Diff Header -->
    <div class="dbx-pane-header h-8 bg-muted/40 border-b border-border flex items-center justify-between px-3 select-none">
      <div class="flex items-center space-x-2 truncate">
        <FileCode class="w-4 h-4 text-primary shrink-0" />
        <span class="font-bold text-foreground truncate">{{ diffStore.selectedFile || 'No file selected' }}</span>

        <span class="inline-flex items-center space-x-1 text-[11px] font-mono font-bold">
          <span class="text-emerald-600 dark:text-emerald-400">+{{ diffStore.activeDiff.additions }}</span>
          <span class="text-rose-600 dark:text-rose-400">-{{ diffStore.activeDiff.deletions }}</span>
        </span>
      </div>

      <!-- Mode Switcher -->
      <div class="flex items-center space-x-1.5">
        <div class="flex items-center bg-secondary/80 rounded-md p-0.5 border border-border shadow-2xs">
          <button
            @click="viewMode = 'unified'"
            class="px-2 py-0.5 rounded text-[11px] font-semibold transition active:scale-95"
            :class="viewMode === 'unified' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'"
          >
            Unified
          </button>
          <button
            @click="viewMode = 'split'"
            class="px-2 py-0.5 rounded text-[11px] font-semibold transition active:scale-95"
            :class="viewMode === 'split' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'"
          >
            Split
          </button>
        </div>
      </div>
    </div>

    <!-- Diff Content Body -->
    <div class="flex-1 overflow-y-auto font-mono text-[12px] bg-card">
      <div v-if="!diffStore.selectedFile" class="p-8 text-center text-muted-foreground">
        Select a changed file or a commit node above to view diff changes.
      </div>

      <div v-for="(hunk, hIdx) in diffStore.activeDiff.hunks" :key="hIdx" class="border-b border-border/60">
        <!-- Hunk Header Bar -->
        <div class="bg-muted/60 text-muted-foreground px-3 py-1 flex items-center justify-between select-none text-[11px] font-semibold">
          <span>{{ hunk.header }}</span>
          <div class="flex items-center space-x-2">
            <button class="hover:text-emerald-600 dark:hover:text-emerald-400 transition flex items-center space-x-1">
              <Plus class="w-3 h-3" />
              <span>Stage Hunk</span>
            </button>
            <button class="hover:text-rose-600 dark:hover:text-rose-400 transition flex items-center space-x-1">
              <RotateCcw class="w-3 h-3" />
              <span>Discard Hunk</span>
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

            <!-- Line Hover Action Button -->
            <div class="hidden group-hover:flex items-center space-x-1 px-2 select-none">
              <button
                class="px-1.5 py-0.5 rounded bg-secondary hover:bg-muted text-foreground text-[10px] font-semibold shadow-2xs"
                title="Stage this line"
              >
                Stage Line
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
