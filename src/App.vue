<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
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

function handleKeyDown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && (e.key === '`' || e.key === 'j')) {
    e.preventDefault();
    consoleStore.toggleConsole();
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeyDown);
  void updatesStore.initialize();
  updateCheckTimer = window.setTimeout(() => {
    void updatesStore.checkForUpdates(false);
  }, 3500);
  if (repoStore.activeRepoPath) {
    await repoStore.loadRepo();
  } else {
    repoStore.isAddRepoModalOpen = true;
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
  if (updateCheckTimer !== undefined) window.clearTimeout(updateCheckTimer);
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
      <SidebarWorkspace />

      <!-- 2. Central & Right Workspace Layout -->
      <div class="flex-1 flex flex-col overflow-hidden min-h-0 dbx-workspace">
        <!-- Top Half: Commit Graph Tree View (45% height) -->
        <div class="h-[45%] flex flex-col overflow-hidden min-h-[160px]">
          <CommitGraphCanvas />
        </div>

        <!-- Bottom Half: Staging Panel + Commit Box + Diff Viewer (55% height) -->
        <div class="flex-1 flex overflow-hidden border-t border-border min-h-[260px]">
          <!-- Staging & Commit Area (Left) - Expanded to 384px -->
          <div class="w-96 flex flex-col border-r border-border shrink-0 bg-card overflow-hidden">
            <div class="flex-1 overflow-hidden min-h-0">
              <StagingPanel />
            </div>
            <CommitBox v-if="!repoStore.repoInfo?.is_merging && !repoStore.repoInfo?.is_rebasing && !repoStore.repoInfo?.is_cherry_picking" />
            <div v-else class="px-3 py-2 border-t border-amber-500/30 bg-amber-500/10 text-[11px] text-amber-700 dark:text-amber-300">
              {{ repoStore.statusSummary.conflicted_files.length > 0
                ? t('Resolve every conflicted file before continuing.')
                : t('All conflicts are resolved. Use Continue in the toolbar.') }}
            </div>
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
    <ConsolePanel />

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
