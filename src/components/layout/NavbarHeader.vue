<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { useSettingsStore } from '@/stores/settings';
import { useAiStore } from '@/stores/ai';
import { useNotificationStore } from '@/stores/notification';
import { useUpdatesStore } from '@/stores/updates';
import { useI18n } from '@/i18n';
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
  Terminal,
  Code2,
} from 'lucide-vue-next';
import { useGitApi, formatGitError } from '@/composables/useGitApi';

const repoStore = useRepoStore();
const settingsStore = useSettingsStore();
const aiStore = useAiStore();
const notification = useNotificationStore();
const updatesStore = useUpdatesStore();
const { t } = useI18n();
const gitApi = useGitApi();

const isRepoDropdownOpen = ref(false);
const isEditorDropdownOpen = ref(false);
const isOpeningTerminal = ref(false);
const isOpeningFileManager = ref(false);
const isOpeningEditor = ref<'vscode' | 'idea' | null>(null);

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

async function handleOpenTerminal() {
  const repoPath = repoStore.activeRepoPath;
  if (!repoPath || isOpeningTerminal.value) return;

  isOpeningTerminal.value = true;
  try {
    await gitApi.openSystemTerminal(repoPath);
    notification.success(t('System Terminal Opened'), t('Opened terminal in {path}', { path: repoPath }));
  } catch (error) {
    notification.error(t('Failed to Open System Terminal'), formatGitError(error, t('Could not open a terminal for the current repository.')));
  } finally {
    isOpeningTerminal.value = false;
  }
}

async function handleOpenFileManager() {
  const repoPath = repoStore.activeRepoPath;
  if (!repoPath || isOpeningFileManager.value) return;

  isOpeningFileManager.value = true;
  try {
    await gitApi.openFileManager(repoPath);
    notification.success(t('File Explorer Opened'), t('Opened file manager in {path}', { path: repoPath }));
  } catch (error) {
    notification.error(t('Failed to Open File Explorer'), formatGitError(error, t('Could not open the file manager for the current repository.')));
  } finally {
    isOpeningFileManager.value = false;
  }
}

async function handleOpenInEditor(editor: 'vscode' | 'idea') {
  const repoPath = repoStore.activeRepoPath;
  if (!repoPath || isOpeningEditor.value) return;

  isEditorDropdownOpen.value = false;
  isOpeningEditor.value = editor;
  const editorName = editor === 'vscode' ? 'Visual Studio Code' : 'IntelliJ IDEA';
  try {
    await gitApi.openInEditor(repoPath, editor);
    notification.success(t('Editor Opened'), t('Opened {path} in {editor}', { path: repoPath, editor: editorName }));
  } catch (error) {
    notification.error(t('Failed to Open Editor'), formatGitError(error, t('Could not open {editor}. Make sure it is installed.', { editor: editorName })));
  } finally {
    isOpeningEditor.value = null;
  }
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
  if (!target.closest('#editor-dropdown-container')) {
    isEditorDropdownOpen.value = false;
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
          <span class="truncate">{{ repoStore.repoInfo?.name || t('Select Repository') }}</span>
          <ChevronDown class="w-3 h-3 text-muted-foreground shrink-0 transition-transform" :class="{ 'rotate-180': isRepoDropdownOpen }" />
        </button>

        <!-- Dropdown Popover (DBX Card Style) -->
        <div
          v-if="isRepoDropdownOpen"
          class="absolute left-0 top-full mt-1.5 w-72 bg-card border border-border rounded-lg shadow-xl py-1 z-50 text-xs animate-in fade-in zoom-in-95 duration-100 divide-y divide-border/60"
        >
          <div class="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
            <span>{{ t('Managed Repositories') }}</span>
            <button
              @click.stop="isRepoDropdownOpen = false; repoStore.isAddRepoModalOpen = true"
              class="text-primary hover:underline flex items-center space-x-0.5 font-semibold"
            >
              <Plus class="w-3 h-3" />
              <span>{{ t('Add') }}</span>
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
                :title="t('Remove from Workspace')"
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
        :title="t('Add or Clone Repository')"
      >
        <Plus class="w-3.5 h-3.5" />
      </button>

      <!-- Repository-scoped escape hatch for advanced Git commands. -->
      <div id="editor-dropdown-container" class="relative">
        <button
          @click.stop="isEditorDropdownOpen = !isEditorDropdownOpen"
          :disabled="!repoStore.activeRepoPath || Boolean(isOpeningEditor)"
          class="flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-secondary active:scale-95 text-muted-foreground hover:text-foreground transition disabled:opacity-40 disabled:cursor-not-allowed"
          :title="t('Open Repository in Editor')"
        >
          <Code2 class="w-3.5 h-3.5" :class="{ 'animate-pulse': isOpeningEditor }" />
          <ChevronDown class="w-3 h-3 transition-transform" :class="{ 'rotate-180': isEditorDropdownOpen }" />
        </button>
        <div
          v-if="isEditorDropdownOpen"
          class="absolute left-0 top-full mt-1.5 w-48 rounded-lg border border-border bg-card py-1 shadow-xl z-50"
        >
          <button
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-foreground hover:bg-secondary transition"
            @click="handleOpenInEditor('vscode')"
          >
            <Code2 class="h-3.5 w-3.5 text-sky-500" />
            <span>Visual Studio Code</span>
          </button>
          <button
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-foreground hover:bg-secondary transition"
            @click="handleOpenInEditor('idea')"
          >
            <Code2 class="h-3.5 w-3.5 text-violet-500" />
            <span>IntelliJ IDEA</span>
          </button>
        </div>
      </div>

      <button
        @click="handleOpenTerminal"
        :disabled="!repoStore.activeRepoPath || isOpeningTerminal"
        class="p-1.5 rounded-md hover:bg-secondary active:scale-95 text-muted-foreground hover:text-foreground transition disabled:opacity-40 disabled:cursor-not-allowed"
        :title="t('Open System Terminal')"
      >
        <Terminal class="w-3.5 h-3.5" :class="{ 'animate-pulse': isOpeningTerminal }" />
      </button>
      <button
        @click="handleOpenFileManager"
        :disabled="!repoStore.activeRepoPath || isOpeningFileManager"
        class="p-1.5 rounded-md hover:bg-secondary active:scale-95 text-muted-foreground hover:text-foreground transition disabled:opacity-40 disabled:cursor-not-allowed"
        :title="t('Open File Explorer')"
      >
        <FolderOpen class="w-3.5 h-3.5" :class="{ 'animate-pulse': isOpeningFileManager }" />
      </button>
    </div>

    <!-- Center: Active Repo Status Badge -->
    <div class="flex items-center space-x-2">
      <span
        v-if="repoStore.statusSummary.total_changes > 0"
        class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30"
      >
        {{ t('{count} uncommitted changes', { count: repoStore.statusSummary.total_changes }) }}
      </span>
      <span
        v-else
        class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
      >
        ✓ {{ t('Working tree clean') }}
      </span>
    </div>

    <!-- Right: AI Copilot Button, Refresh, Theme Toggle, Settings -->
    <div class="flex items-center space-x-1.5">
      <button
        @click="aiStore.openAiModal()"
          class="flex items-center space-x-1.5 px-2.5 py-1 rounded-sm bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 active:scale-95 transition font-medium"
        :title="t('Open AI Commit & Assistant Modal')"
      >
        <Sparkles class="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
        <span class="text-[11px] font-bold">{{ t('AI Copilot') }}</span>
      </button>

      <button
        @click="handleRefresh"
        class="p-1.5 rounded-md hover:bg-secondary active:scale-95 text-muted-foreground hover:text-foreground transition"
        :title="t('Refresh Repository')"
      >
        <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': repoStore.isLoading }" />
      </button>

      <button
        @click="handleToggleTheme"
        class="p-1.5 rounded-md hover:bg-secondary active:scale-95 text-muted-foreground hover:text-foreground transition"
        :title="t('Toggle Light/Dark Theme')"
      >
        <Sun v-if="settingsStore.isDark" class="w-3.5 h-3.5 text-amber-400" />
        <Moon v-else class="w-3.5 h-3.5 text-slate-600" />
      </button>

      <button
        @click="settingsStore.isSettingsModalOpen = true"
        class="relative p-1.5 rounded-md hover:bg-secondary active:scale-95 text-muted-foreground hover:text-foreground transition"
        :title="t('Open Settings')"
      >
        <Settings class="w-3.5 h-3.5" />
        <span
          v-if="updatesStore.hasUpdateAvailable"
          class="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-card"
          :title="t('New version available')"
          aria-label="New version available"
        />
      </button>
    </div>
  </header>
</template>
