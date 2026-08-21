<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { useSettingsStore } from '@/stores/settings';
import { useAiStore } from '@/stores/ai';
import { useNotificationStore } from '@/stores/notification';
import {
  FolderGit2,
  Sparkles,
  Sun,
  Moon,
  Settings,
  RefreshCw,
  Plus,
  ChevronDown,
  Trash2,
  FolderOpen,
} from 'lucide-vue-next';

const repoStore = useRepoStore();
const settingsStore = useSettingsStore();
const aiStore = useAiStore();
const notification = useNotificationStore();

const isRepoDropdownOpen = ref(false);

function handleSelectRepo(path: string) {
  isRepoDropdownOpen.value = false;
  repoStore.switchRepo(path);
  notification.info('Switched Repository', `Active workspace: ${path}`);
}

function handleRemoveRepo(e: Event, path: string) {
  e.stopPropagation();
  repoStore.removeRepo(path);
  notification.warning('Repository Removed', path);
}

async function handleRefresh() {
  await repoStore.loadRepo();
  notification.success('Repository Refreshed', 'Branches, commits and file statuses are up to date.');
}

function handleToggleTheme() {
  settingsStore.toggleTheme();
  notification.info(settingsStore.isDark ? 'Dark Theme Activated' : 'Light Theme Activated');
}

function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!target.closest('#repo-dropdown-container')) {
    isRepoDropdownOpen.value = false;
  }
}

onMounted(() => {
  window.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  window.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <header
    class="dbx-header h-10 bg-card border-b border-border flex items-center justify-between px-3 text-xs select-none relative z-30"
  >
    <!-- Left: App Logo & Repo Dropdown Selector -->
    <div class="flex items-center space-x-2">
      <div class="flex items-center space-x-1.5 font-bold tracking-tight cursor-pointer hover:opacity-85 transition">
        <div class="w-5 h-5 rounded-sm bg-primary flex items-center justify-center text-primary-foreground">
          <FolderGit2 class="w-3.5 h-3.5" />
        </div>
        <span class="text-sm font-black tracking-wider text-foreground">GITBX</span>
      </div>

      <div class="h-4 w-[1px] bg-border mx-1"></div>

      <!-- Repo Dropdown Menu Container -->
      <div id="repo-dropdown-container" class="relative">
        <button
          @click.stop="isRepoDropdownOpen = !isRepoDropdownOpen"
          class="flex items-center space-x-1.5 px-2.5 py-1 rounded-sm bg-secondary hover:bg-accent border border-border text-foreground font-medium transition active:scale-95 max-w-[260px]"
        >
          <FolderOpen class="w-3.5 h-3.5 text-primary shrink-0" />
          <span class="truncate">{{ repoStore.repoInfo?.name || 'Select Repository' }}</span>
          <ChevronDown class="w-3 h-3 text-muted-foreground shrink-0 transition-transform" :class="{ 'rotate-180': isRepoDropdownOpen }" />
        </button>

        <!-- Dropdown Popover (DBX Card Style) -->
        <div
          v-if="isRepoDropdownOpen"
          class="absolute left-0 top-full mt-1.5 w-72 bg-card border border-border rounded-lg shadow-xl py-1 z-50 text-xs animate-in fade-in zoom-in-95 duration-100 divide-y divide-border/60"
        >
          <div class="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
            <span>Managed Repositories</span>
            <button
              @click.stop="isRepoDropdownOpen = false; repoStore.isAddRepoModalOpen = true"
              class="text-primary hover:underline flex items-center space-x-0.5 font-semibold"
            >
              <Plus class="w-3 h-3" />
              <span>Add</span>
            </button>
          </div>

          <div class="max-h-56 overflow-y-auto py-1 divide-y divide-border/30">
            <div
              v-for="repo in repoStore.repoList"
              :key="repo.path"
              @click="handleSelectRepo(repo.path)"
              class="px-3 py-2 flex items-center justify-between hover:bg-secondary cursor-pointer group transition"
              :class="repoStore.activeRepoPath === repo.path ? 'bg-primary/10 text-primary font-semibold' : 'text-foreground'"
            >
              <div class="truncate pr-2">
                <div class="truncate font-medium">{{ repo.name }}</div>
                <div class="text-[10px] text-muted-foreground truncate opacity-75">{{ repo.path }}</div>
              </div>
              <button
                v-if="repoStore.repoList.length > 1"
                @click="handleRemoveRepo($event, repo.path)"
                class="p-1 rounded hover:bg-destructive/20 hover:text-rose-600 text-muted-foreground opacity-0 group-hover:opacity-100 transition shrink-0"
                title="Remove from Workspace"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Add Repo Quick Button -->
      <button
        @click="repoStore.isAddRepoModalOpen = true"
        class="p-1.5 rounded-md hover:bg-secondary active:scale-95 text-muted-foreground hover:text-foreground transition"
        title="Add or Clone Repository"
      >
        <Plus class="w-3.5 h-3.5" />
      </button>
    </div>

    <!-- Center: Active Repo Status Badge -->
    <div class="flex items-center space-x-2">
      <span
        v-if="repoStore.statusSummary.total_changes > 0"
        class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30"
      >
        ● {{ repoStore.statusSummary.total_changes }} uncommitted changes
      </span>
      <span
        v-else
        class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
      >
        ✓ Working tree clean
      </span>
    </div>

    <!-- Right: AI Copilot Button, Refresh, Theme Toggle, Settings -->
    <div class="flex items-center space-x-1.5">
      <button
        @click="aiStore.openAiModal()"
          class="flex items-center space-x-1.5 px-2.5 py-1 rounded-sm bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 active:scale-95 transition font-medium"
        title="Open AI Commit & Assistant Modal"
      >
        <Sparkles class="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
        <span class="text-[11px] font-bold">AI Copilot</span>
      </button>

      <button
        @click="handleRefresh"
        class="p-1.5 rounded-md hover:bg-secondary active:scale-95 text-muted-foreground hover:text-foreground transition"
        title="Refresh Repository"
      >
        <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': repoStore.isLoading }" />
      </button>

      <button
        @click="handleToggleTheme"
        class="p-1.5 rounded-md hover:bg-secondary active:scale-95 text-muted-foreground hover:text-foreground transition"
        title="Toggle Light/Dark Theme"
      >
        <Sun v-if="settingsStore.isDark" class="w-3.5 h-3.5 text-amber-400" />
        <Moon v-else class="w-3.5 h-3.5 text-slate-600" />
      </button>

      <button
        @click="settingsStore.isSettingsModalOpen = true"
        class="p-1.5 rounded-md hover:bg-secondary active:scale-95 text-muted-foreground hover:text-foreground transition"
        title="Open Settings"
      >
        <Settings class="w-3.5 h-3.5" />
      </button>
    </div>
  </header>
</template>
