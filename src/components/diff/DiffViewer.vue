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
  <div class="h-full flex flex-col bg-card overflow-hidden text-xs">
    <!-- Diff Header -->
    <div class="h-8 bg-muted/40 border-b border-border flex items-center justify-between px-3 select-none">
      <div class="flex items-center space-x-2 truncate">
        <FileCode class="w-4 h-4 text-blue-400 shrink-0" />
        <span class="font-medium text-foreground truncate">{{ diffStore.selectedFile || 'No file selected' }}</span>

        <span class="inline-flex items-center space-x-1 text-[11px] font-mono">
          <span class="text-emerald-400">+{{ diffStore.activeDiff.additions }}</span>
          <span class="text-rose-400">-{{ diffStore.activeDiff.deletions }}</span>
        </span>
      </div>

      <!-- Mode Switcher & Actions -->
      <div class="flex items-center space-x-1.5">
        <div class="flex items-center bg-background rounded p-0.5 border border-border">
          <button
            @click="viewMode = 'unified'"
            class="px-2 py-0.5 rounded text-[11px] font-medium transition"
            :class="viewMode === 'unified' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'"
          >
            Unified
          </button>
          <button
            @click="viewMode = 'split'"
            class="px-2 py-0.5 rounded text-[11px] font-medium transition"
            :class="viewMode === 'split' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'"
          >
            Split
          </button>
        </div>
      </div>
    </div>

    <!-- Diff Content Body -->
    <div class="flex-1 overflow-y-auto font-mono text-[12px] bg-background">
      <div v-for="(hunk, hIdx) in diffStore.activeDiff.hunks" :key="hIdx" class="border-b border-border/40">
        <!-- Hunk Header Bar -->
        <div class="bg-muted/60 text-muted-foreground px-3 py-1 flex items-center justify-between select-none text-[11px] font-medium">
          <span>{{ hunk.header }}</span>
          <div class="flex items-center space-x-2">
            <button class="hover:text-emerald-400 transition flex items-center space-x-1">
              <Plus class="w-3 h-3" />
              <span>Stage Hunk</span>
            </button>
            <button class="hover:text-rose-400 transition flex items-center space-x-1">
              <RotateCcw class="w-3 h-3" />
              <span>Discard Hunk</span>
            </button>
          </div>
        </div>

        <!-- Hunk Lines -->
        <div class="divide-y divide-border/10">
          <div
            v-for="(line, lIdx) in hunk.lines"
            :key="lIdx"
            class="flex items-center group transition"
            :class="{
              'bg-emerald-500/10 text-emerald-300': line.line_type === 'Addition',
              'bg-rose-500/10 text-rose-300': line.line_type === 'Deletion',
              'text-muted-foreground': line.line_type === 'Context',
            }"
          >
            <!-- Line numbers -->
            <div class="w-10 text-right pr-2 py-0.5 select-none text-muted-foreground/60 opacity-60 text-[10px]">
              {{ line.old_lineno || '' }}
            </div>
            <div class="w-10 text-right pr-2 py-0.5 select-none text-muted-foreground/60 opacity-60 text-[10px] border-r border-border/30">
              {{ line.new_lineno || '' }}
            </div>

            <!-- Prefix symbol (+ / - / space) -->
            <div class="w-5 text-center font-bold select-none">
              <span v-if="line.line_type === 'Addition'">+</span>
              <span v-else-if="line.line_type === 'Deletion'">-</span>
              <span v-else>&nbsp;</span>
            </div>

            <!-- Line Content -->
            <div class="flex-1 px-1 py-0.5 whitespace-pre overflow-x-auto text-foreground">
              {{ line.content }}
            </div>

            <!-- Line Hover Action Button -->
            <div class="hidden group-hover:flex items-center space-x-1 px-2 select-none">
              <button
                class="px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-muted-foreground hover:text-foreground text-[10px]"
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
