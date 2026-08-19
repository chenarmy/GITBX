<script setup lang="ts">
import { useRepoStore } from '@/stores/repo';
import { useSettingsStore } from '@/stores/settings';
import { useAiStore } from '@/stores/ai';
import {
  FolderGit2,
  Sparkles,
  Sun,
  Moon,
  Settings,
  RefreshCw,
} from 'lucide-vue-next';

const repoStore = useRepoStore();
const settingsStore = useSettingsStore();
const aiStore = useAiStore();
</script>

<template>
  <header
    class="h-10 bg-muted/40 border-b border-border flex items-center justify-between px-3 text-xs select-none drag-region"
  >
    <!-- Left: App Logo & Repo Path -->
    <div class="flex items-center space-x-3">
      <div class="flex items-center space-x-1.5 font-bold text-primary tracking-wide">
        <FolderGit2 class="w-4 h-4 text-blue-500" />
        <span class="text-sm font-black bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">GITBX</span>
      </div>

      <div class="h-4 w-[1px] bg-border mx-1"></div>

      <div class="flex items-center space-x-1 text-muted-foreground hover:text-foreground cursor-pointer px-2 py-1 rounded hover:bg-accent transition">
        <span class="font-medium text-foreground">{{ repoStore.repoInfo?.name || 'GITBX' }}</span>
        <span class="text-[10px] text-muted-foreground opacity-60">({{ repoStore.activeRepoPath }})</span>
      </div>
    </div>

    <!-- Center: Dirty Status Indicator -->
    <div class="flex items-center space-x-2">
      <span
        v-if="repoStore.statusSummary.total_changes > 0"
        class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse"
      >
        ● {{ repoStore.statusSummary.total_changes }} uncommitted changes
      </span>
      <span
        v-else
        class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
      >
        ✓ Working tree clean
      </span>
    </div>

    <!-- Right: AI Copilot Button, Theme Toggle, Settings -->
    <div class="flex items-center space-x-1.5">
      <button
        @click="aiStore.openAiModal()"
        class="flex items-center space-x-1 px-2.5 py-1 rounded bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 transition shadow-sm"
      >
        <Sparkles class="w-3.5 h-3.5" />
        <span class="font-medium text-[11px]">AI Copilot</span>
      </button>

      <button
        @click="repoStore.loadRepo(repoStore.activeRepoPath)"
        class="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition"
        title="Refresh Repository"
      >
        <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': repoStore.isLoading }" />
      </button>

      <button
        @click="settingsStore.toggleTheme()"
        class="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition"
        title="Toggle Theme"
      >
        <Sun v-if="settingsStore.isDark" class="w-3.5 h-3.5 text-amber-300" />
        <Moon v-else class="w-3.5 h-3.5 text-slate-700" />
      </button>

      <button
        @click="settingsStore.isSettingsModalOpen = true"
        class="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition"
        title="Settings"
      >
        <Settings class="w-3.5 h-3.5" />
      </button>
    </div>
  </header>
</template>
