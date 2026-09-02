<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import NavbarHeader from '@/components/layout/NavbarHeader.vue';
import MainToolbar from '@/components/layout/MainToolbar.vue';
import SidebarWorkspace from '@/components/layout/SidebarWorkspace.vue';
import CommitGraphCanvas from '@/components/graph/CommitGraphCanvas.vue';
import StagingPanel from '@/components/staging/StagingPanel.vue';
import CommitBox from '@/components/staging/CommitBox.vue';
import DiffViewer from '@/components/diff/DiffViewer.vue';
import MergeConflictEditor from '@/components/merge/MergeConflictEditor.vue';
import ConsolePanel from '@/components/layout/ConsolePanel.vue';
import FooterBar from '@/components/layout/FooterBar.vue';
import AiAssistantModal from '@/components/ai/AiAssistantModal.vue';
import SettingsModal from '@/components/dialogs/SettingsModal.vue';
import UpdateAvailableDialog from '@/components/dialogs/UpdateAvailableDialog.vue';
import AddRepoModal from '@/components/dialogs/AddRepoModal.vue';
import BranchModal from '@/components/dialogs/BranchModal.vue';
import TagModal from '@/components/dialogs/TagModal.vue';
import StashModal from '@/components/dialogs/StashModal.vue';
import MergeModal from '@/components/dialogs/MergeModal.vue';
import RebaseModal from '@/components/dialogs/RebaseModal.vue';
import ResetModal from '@/components/dialogs/ResetModal.vue';
import RenameBranchModal from '@/components/dialogs/RenameBranchModal.vue';
import RemoteManagerModal from '@/components/dialogs/RemoteManagerModal.vue';
import FileInvestigationModal from '@/components/dialogs/FileInvestigationModal.vue';
import SyncStatusModal from '@/components/dialogs/SyncStatusModal.vue';
import WorktreeManagerModal from '@/components/dialogs/WorktreeManagerModal.vue';
import ChangelistManagerModal from '@/components/dialogs/ChangelistManagerModal.vue';
import PullRequestModal from '@/components/dialogs/PullRequestModal.vue';
import LocalHistoryModal from '@/components/dialogs/LocalHistoryModal.vue';
import ToastContainer from '@/components/ui/ToastContainer.vue';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog.vue';
import { useRepoStore } from '@/stores/repo';
import { useConsoleStore } from '@/stores/console';
import { useUpdatesStore } from '@/stores/updates';
import { useDiffStore } from '@/stores/diff';
import { useI18n } from '@/i18n';

const repoStore = useRepoStore();
const consoleStore = useConsoleStore();
const updatesStore = useUpdatesStore();
const diffStore = useDiffStore();
const { t } = useI18n();
let updateCheckTimer: number | undefined;
let updateCheckInterval: number | undefined;
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

type ResizeTarget = 'sidebar' | 'graph' | 'staging' | 'commit' | 'console';

const workspaceRef = ref<HTMLElement | null>(null);
const bottomWorkspaceRef = ref<HTMLElement | null>(null);
const stagingColumnRef = ref<HTMLElement | null>(null);
const sidebarWidth = ref(readLayoutSize('sidebar', 240));
const graphHeight = ref(readLayoutSize('graph', 0));
const stagingWidth = ref(readLayoutSize('staging', 384));
const commitHeight = ref(readLayoutSize('commit', 176));
const consoleHeight = ref(readLayoutSize('console', 240));

function readLayoutSize(key: ResizeTarget, fallback: number) {
  const value = Number(localStorage.getItem(`gitbx_layout_${key}`));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function startResize(target: ResizeTarget, event: PointerEvent) {
  event.preventDefault();
  const startX = event.clientX;
  const startY = event.clientY;
  const workspaceRect = workspaceRef.value?.getBoundingClientRect();
  const bottomRect = bottomWorkspaceRef.value?.getBoundingClientRect();
  const stagingRect = stagingColumnRef.value?.getBoundingClientRect();
  const startValue = target === 'sidebar'
    ? sidebarWidth.value
    : target === 'graph'
      ? (graphHeight.value || (workspaceRect?.height ?? 0) * 0.45 || 320)
      : target === 'staging'
        ? stagingWidth.value
        : target === 'commit'
          ? commitHeight.value
          : consoleHeight.value;

  document.body.classList.add('dbx-resizing');
  document.body.style.cursor = target === 'sidebar' || target === 'staging' ? 'col-resize' : 'row-resize';

  const move = (moveEvent: PointerEvent) => {
    if (target === 'sidebar') {
      sidebarWidth.value = clamp(startValue + moveEvent.clientX - startX, 180, window.innerWidth * 0.4);
    } else if (target === 'graph') {
      graphHeight.value = clamp(startValue + moveEvent.clientY - startY, 160, (workspaceRect?.height || 600) - 260);
    } else if (target === 'staging') {
      stagingWidth.value = clamp(startValue + moveEvent.clientX - startX, 260, (bottomRect?.width || 800) - 320);
    } else if (target === 'commit') {
      commitHeight.value = clamp(startValue - (moveEvent.clientY - startY), 120, (stagingRect?.height || 400) - 120);
    } else {
      consoleHeight.value = clamp(startValue - (moveEvent.clientY - startY), 96, window.innerHeight * 0.65);
    }
  };

  const stop = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
    document.body.classList.remove('dbx-resizing');
    document.body.style.cursor = '';
    const value = target === 'sidebar'
      ? sidebarWidth.value
      : target === 'graph'
        ? graphHeight.value
        : target === 'staging'
          ? stagingWidth.value
          : target === 'commit'
            ? commitHeight.value
            : consoleHeight.value;
    localStorage.setItem(`gitbx_layout_${target}`, String(Math.round(value)));
  };

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop, { once: true });
  window.addEventListener('pointercancel', stop, { once: true });
}

function handleKeyDown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && (e.key === '`' || e.key === 'j')) {
    e.preventDefault();
    consoleStore.toggleConsole();
  }
}

function checkForUpdatesInBackground() {
  void updatesStore.checkForUpdates(false, false);
}

function handleVisibilityChange() {
  if (document.visibilityState !== 'visible') return;
  const lastCheckAt = updatesStore.lastUpdateCheckAt ?? 0;
  if (Date.now() - lastCheckAt >= UPDATE_CHECK_INTERVAL_MS) {
    checkForUpdatesInBackground();
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeyDown);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  void updatesStore.initialize();
  updateCheckTimer = window.setTimeout(() => {
    void updatesStore.checkForUpdates(false);
  }, 3500);
  updateCheckInterval = window.setInterval(checkForUpdatesInBackground, UPDATE_CHECK_INTERVAL_MS);
  if (repoStore.activeRepoPath) {
    await repoStore.loadRepo();
  } else {
    repoStore.isAddRepoModalOpen = true;
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  if (updateCheckTimer !== undefined) window.clearTimeout(updateCheckTimer);
  if (updateCheckInterval !== undefined) window.clearInterval(updateCheckInterval);
});
</script>

<template>
  <div class="dbx-shell h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden font-sans">
    <!-- Top Header -->
    <NavbarHeader />

    <!-- Actions Toolbar -->
    <MainToolbar />

    <!-- Main Workspace Container -->
    <div class="flex-1 flex overflow-hidden min-h-0">
      <!-- 1. Left Sidebar Navigation -->
      <div class="relative h-full shrink-0" :style="{ width: `${sidebarWidth}px` }">
        <SidebarWorkspace />
        <div class="resize-handle resize-handle-x right-0" role="separator" aria-orientation="vertical" @pointerdown="startResize('sidebar', $event)" />
      </div>

      <!-- 2. Central & Right Workspace Layout -->
      <div ref="workspaceRef" class="flex-1 flex flex-col overflow-hidden min-h-0 dbx-workspace">
        <!-- Top Half: Commit Graph Tree View (45% height) -->
        <div class="flex flex-col overflow-hidden min-h-[160px] shrink-0" :style="{ height: graphHeight ? `${graphHeight}px` : '45%' }">
          <CommitGraphCanvas />
        </div>

        <div class="resize-handle resize-handle-y" role="separator" aria-orientation="horizontal" @pointerdown="startResize('graph', $event)" />

        <!-- Bottom Half: Staging Panel + Commit Box + Diff Viewer (55% height) -->
        <div ref="bottomWorkspaceRef" class="flex-1 flex overflow-hidden min-h-[260px]">
          <!-- Staging & Commit Area (Left) - Expanded to 384px -->
          <div ref="stagingColumnRef" class="relative flex flex-col shrink-0 bg-card overflow-hidden" :style="{ width: `${stagingWidth}px` }">
            <div class="flex-1 overflow-hidden min-h-0">
              <StagingPanel />
            </div>
            <template v-if="!repoStore.repoInfo?.is_merging && !repoStore.repoInfo?.is_rebasing && !repoStore.repoInfo?.is_cherry_picking">
              <div class="resize-handle resize-handle-y" role="separator" aria-orientation="horizontal" @pointerdown="startResize('commit', $event)" />
              <div class="shrink-0 overflow-hidden" :style="{ height: `${commitHeight}px` }">
                <CommitBox />
              </div>
            </template>
            <div v-else class="px-3 py-2 border-t border-amber-500/30 bg-amber-500/10 text-[11px] text-amber-700 dark:text-amber-300">
              {{ repoStore.statusSummary.conflicted_files.length > 0
                ? t('Resolve every conflicted file before continuing.')
                : t('All conflicts are resolved. Use Continue in the toolbar.') }}
            </div>
            <div class="resize-handle resize-handle-x right-0" role="separator" aria-orientation="vertical" @pointerdown="startResize('staging', $event)" />
          </div>

          <!-- Diff Inspection Area (Right) -->
          <div class="flex-1 overflow-hidden min-w-0">
            <MergeConflictEditor v-if="diffStore.selectedConflictFile" />
            <DiffViewer v-else />
          </div>
        </div>
      </div>
    </div>

    <!-- Output & Operation Console Drawer -->
    <div v-if="consoleStore.isOpen" class="relative shrink-0 border-t border-border" :style="{ height: `${consoleHeight}px` }">
      <div class="resize-handle resize-handle-y absolute left-0 right-0 top-0 z-30" role="separator" aria-orientation="horizontal" @pointerdown="startResize('console', $event)" />
      <ConsolePanel />
    </div>

    <!-- Bottom Status Bar -->
    <FooterBar />

    <!-- Modals -->
    <AddRepoModal />
    <BranchModal />
    <TagModal />
    <StashModal />
    <MergeModal />
    <RebaseModal />
    <ResetModal />
    <RenameBranchModal />
    <RemoteManagerModal />
    <FileInvestigationModal />
    <SyncStatusModal />
    <WorktreeManagerModal />
    <ChangelistManagerModal />
    <PullRequestModal />
    <LocalHistoryModal />
    <AiAssistantModal />
    <SettingsModal />
    <UpdateAvailableDialog />

    <!-- Global Toast Container -->
    <ToastContainer />
    <ConfirmationDialog />
  </div>
</template>

<style>
html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  width: 100%;
}
</style>

<style>
.resize-handle {
  position: relative;
  z-index: 25;
  flex: 0 0 auto;
  background: hsl(var(--border));
  transition: background-color 120ms ease;
  touch-action: none;
}

.resize-handle:hover,
.dbx-resizing .resize-handle {
  background: hsl(var(--primary) / 0.75);
}

.resize-handle-x {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  cursor: col-resize;
}

.resize-handle-x::after {
  content: '';
  position: absolute;
  inset: 0 -3px;
}

.resize-handle-y {
  height: 1px;
  width: 100%;
  cursor: row-resize;
}

.resize-handle-y::after {
  content: '';
  position: absolute;
  inset: -3px 0;
}

.dbx-resizing,
.dbx-resizing * {
  user-select: none !important;
}
</style>
