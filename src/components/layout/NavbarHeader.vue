<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { useSettingsStore } from '@/stores/settings';
import { useAiStore } from '@/stores/ai';
import { useNotificationStore } from '@/stores/notification';
import { useUpdatesStore } from '@/stores/updates';
import { useI18n } from '@/i18n';
import {
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
  Minus,
  Square,
  Copy,
  X,
} from 'lucide-vue-next';
import { useGitApi, formatGitError } from '@/composables/useGitApi';
import { getCurrentWindow } from '@tauri-apps/api/window';

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
const isMaximized = ref(false);
const isTauriWindow = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const appWindow = isTauriWindow ? getCurrentWindow() : null;
let unlistenResize: (() => void) | undefined;

async function syncWindowState() {
  if (appWindow) {
    try {
      isMaximized.value = await appWindow.isMaximized();
    } catch (err) {
      console.error('Failed to sync window state', err);
    }
  }
}

async function handleMinimize() {
  try {
    await appWindow?.minimize();
  } catch (err) {
    console.error('Failed to minimize window', err);
  }
}

async function handleToggleMaximize() {
  if (!appWindow) return;
  try {
    await appWindow.toggleMaximize();
    await syncWindowState();
  } catch (err) {
    console.error('Failed to toggle maximize window', err);
  }
}

async function handleCloseWindow() {
  try {
    await appWindow?.close();
  } catch (err) {
    console.error('Failed to close window', err);
  }
}

function handleHeaderDoubleClick(event: MouseEvent) {
  const target = event.target as HTMLElement;
  // Tauri handles double-clicks on the drag region itself. Toggling here as well
  // would immediately undo the native maximize/restore action.
  if (target === event.currentTarget) return;
  if (!target.closest('button, input, select, textarea, a')) void handleToggleMaximize();
}

async function handleSelectRepo(path: string) {
  isRepoDropdownOpen.value = false;
  try {
    await repoStore.switchRepo(path);
    notification.info(t('Switched Repository'), t('Active workspace: {path}', { path }));
  } catch (error) {
    notification.error(t('Failed to switch repository'), formatGitError(error));
  }
}

async function handleRemoveRepo(e: Event, path: string) {
  e.stopPropagation();
  try {
    await repoStore.removeRepo(path);
    notification.warning(t('Repository Removed'), path);
  } catch (error) {
    notification.error(t('Failed to remove repository'), formatGitError(error));
  }
}

async function handleRefresh() {
  try {
    await repoStore.loadRepo();
    notification.success(t('Repository Refreshed'), t('Branches, commits and file statuses are up to date.'));
  } catch (error) {
    notification.error(t('Refresh Failed'), formatGitError(error));
  }
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

onMounted(async () => {
  window.addEventListener('click', handleClickOutside);
  if (appWindow) {
    await syncWindowState();
    unlistenResize = await appWindow.onResized(() => void syncWindowState());
  }
});

onUnmounted(() => {
  window.removeEventListener('click', handleClickOutside);
  unlistenResize?.();
});
</script>

<template>
  <header
    class="dbx-header h-11 bg-card border-b border-border flex items-center justify-between px-3.5 text-xs select-none relative z-30"
    data-tauri-drag-region
    @dblclick="handleHeaderDoubleClick"
  >
    <!-- Left: App Logo & Repo Dropdown Selector -->
    <div class="flex items-center gap-2">
      <div class="flex items-center gap-2 font-bold tracking-tight cursor-pointer hover:opacity-90 transition-opacity pr-1">
        <img src="/favicon.png" alt="" class="w-6 h-6 shrink-0" aria-hidden="true" />
        <span class="text-[13px] font-bold tracking-wide text-foreground">GITBX</span>
      </div>

      <div class="h-4 w-px bg-border/80 mx-0.5"></div>

      <!-- Repo Dropdown Menu Container -->
      <div id="repo-dropdown-container" class="relative">
        <button
          @click.stop="isRepoDropdownOpen = !isRepoDropdownOpen"
          class="arco-btn arco-btn-secondary h-7 px-2.5 border border-border/70 hover:border-primary/40 max-w-[260px]"
        >
          <FolderOpen class="w-3.5 h-3.5 text-primary shrink-0" />
          <span class="truncate font-medium">{{ repoStore.repoInfo?.name || t('Select Repository') }}</span>
          <ChevronDown class="w-3 h-3 text-muted-foreground shrink-0 transition-transform duration-150" :class="{ 'rotate-180': isRepoDropdownOpen }" />
        </button>

        <!-- Dropdown Popover (Arco Popover) -->
        <div
          v-if="isRepoDropdownOpen"
          class="arco-popover absolute left-0 top-full mt-1.5 w-80 z-50 text-xs overflow-hidden p-0"
        >
          <div class="px-3 py-2 border-b border-border/70 flex items-center justify-between bg-muted/40">
            <span class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{{ t('Managed Repositories') }}</span>
            <button
              @click.stop="isRepoDropdownOpen = false; repoStore.openModal('addRepo')"
              class="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium"
            >
              <Plus class="w-3 h-3" />
              <span>{{ t('Add') }}</span>
            </button>
          </div>

          <div class="max-h-60 overflow-y-auto py-1 space-y-0.5">
            <div
              v-for="repo in repoStore.repoList"
              :key="repo.path"
              @click.stop="handleSelectRepo(repo.path)"
              class="mx-1 px-2.5 py-2 rounded-[4px] flex items-center justify-between cursor-pointer group transition-colors"
              :class="repoStore.activeRepoPath === repo.path ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-accent/70'"
            >
              <div class="truncate pr-2 min-w-0">
                <div class="flex items-center gap-1.5 truncate font-medium">
                  <span class="truncate">{{ repo.name }}</span>
                  <span
                    v-if="repo.group"
                    class="arco-tag shrink-0 bg-amber-500/10 border-amber-500/25 text-amber-600 dark:text-amber-400"
                  >
                    {{ repo.group }}
                  </span>
                </div>
                <div class="text-[10px] text-muted-foreground truncate mt-0.5">{{ repo.path }}</div>
              </div>
              <button
                v-if="repoStore.repoList.length > 1"
                @click="handleRemoveRepo($event, repo.path)"
                class="arco-icon-btn arco-icon-btn-sm hover:bg-destructive/15 hover:text-destructive opacity-0 group-hover:opacity-100 shrink-0"
                :title="t('Remove from Workspace')"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Repository Actions -->
      <div class="flex items-center gap-0.5 pl-0.5">
        <button
          @click="repoStore.openModal('addRepo')"
          class="arco-icon-btn"
          :title="t('Add or Clone Repository')"
        >
          <Plus class="w-3.5 h-3.5" />
        </button>

        <!-- Repository-scoped escape hatch for advanced Git commands. -->
        <div id="editor-dropdown-container" class="relative">
          <button
            @click.stop="isEditorDropdownOpen = !isEditorDropdownOpen"
            :disabled="!repoStore.activeRepoPath || Boolean(isOpeningEditor)"
            class="arco-btn arco-btn-text h-7 px-1.5 gap-0.5"
            :title="t('Open Repository in Editor')"
          >
            <Code2 class="w-3.5 h-3.5" :class="{ 'animate-pulse': isOpeningEditor }" />
            <ChevronDown class="w-3 h-3 transition-transform duration-150" :class="{ 'rotate-180': isEditorDropdownOpen }" />
          </button>
          <div
            v-if="isEditorDropdownOpen"
            class="arco-menu absolute left-0 top-full mt-1.5 w-48 z-50"
          >
            <button
              class="arco-menu-item"
              @click="handleOpenInEditor('vscode')"
            >
              <Code2 class="h-3.5 w-3.5 text-sky-500" />
              <span>Visual Studio Code</span>
            </button>
            <button
              class="arco-menu-item"
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
          class="arco-icon-btn"
          :title="t('Open System Terminal')"
        >
          <Terminal class="w-3.5 h-3.5" :class="{ 'animate-pulse': isOpeningTerminal }" />
        </button>
        <button
          @click="handleOpenFileManager"
          :disabled="!repoStore.activeRepoPath || isOpeningFileManager"
          class="arco-icon-btn"
          :title="t('Open File Explorer')"
        >
          <FolderOpen class="w-3.5 h-3.5" :class="{ 'animate-pulse': isOpeningFileManager }" />
        </button>
      </div>
    </div>

    <!-- Center: Active Repo Status Badge -->
    <div class="flex items-center">
      <span
        v-if="repoStore.statusSummary.total_changes > 0"
        class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25"
      >
        <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
        {{ t('{count} uncommitted changes', { count: repoStore.statusSummary.total_changes }) }}
      </span>
      <span
        v-else
        class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25"
      >
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
        {{ t('Working tree clean') }}
      </span>
    </div>

    <!-- Right: AI Copilot Button, Refresh, Theme Toggle, Settings -->
    <div class="flex items-center gap-1">
      <button
        @click="aiStore.toggleSidebar()"
        :class="[
          'arco-btn h-7 px-2.5 mr-1',
          aiStore.isSidebarOpen
            ? 'arco-btn-primary'
            : 'bg-primary/10 hover:bg-primary/15 text-primary border border-primary/25'
        ]"
        :title="t('Toggle AI Chat Sidebar')"
      >
        <Sparkles class="w-3.5 h-3.5" :class="aiStore.isSidebarOpen ? 'text-primary-foreground' : 'text-primary'" />
        <span class="text-[11px] font-semibold">{{ t('AI Copilot') }}</span>
      </button>

      <button
        @click="handleRefresh"
        class="arco-icon-btn"
        :title="t('Refresh Repository')"
      >
        <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin text-primary': repoStore.isLoading }" />
      </button>

      <button
        @click="handleToggleTheme"
        class="arco-icon-btn"
        :title="t('Toggle Light/Dark Theme')"
      >
        <Sun v-if="settingsStore.isDark" class="w-3.5 h-3.5 text-amber-400" />
        <Moon v-else class="w-3.5 h-3.5 text-slate-600" />
      </button>

      <button
        data-testid="navbar-settings-btn"
        @click="settingsStore.openSettingsModal()"
        class="arco-icon-btn relative"
        :title="t('Open Settings')"
      >
        <Settings class="w-3.5 h-3.5" />
        <span
          v-if="updatesStore.hasUpdateAvailable"
          class="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive ring-2 ring-card"
          :title="t('New version available')"
          aria-label="New version available"
        />
      </button>

      <div v-if="isTauriWindow" class="h-4 w-px bg-border mx-1"></div>
      <div v-if="isTauriWindow" class="-mr-3.5 h-11 flex items-stretch" aria-label="Window controls">
        <button
          class="w-10 flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          :title="t('Minimize Window')"
          @click="handleMinimize"
        >
          <Minus class="w-3.5 h-3.5" />
        </button>
        <button
          class="w-10 flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          :title="isMaximized ? t('Restore Window') : t('Maximize Window')"
          @click="handleToggleMaximize"
        >
          <Copy v-if="isMaximized" class="w-3 h-3" />
          <Square v-else class="w-3 h-3" />
        </button>
        <button
          class="w-11 flex items-center justify-center text-muted-foreground hover:bg-destructive hover:text-white transition-colors"
          :title="t('Close Window')"
          @click="handleCloseWindow"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  </header>
</template>
