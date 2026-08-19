<script setup lang="ts">
import { onMounted } from 'vue';
import NavbarHeader from '@/components/layout/NavbarHeader.vue';
import MainToolbar from '@/components/layout/MainToolbar.vue';
import SidebarWorkspace from '@/components/layout/SidebarWorkspace.vue';
import CommitGraphCanvas from '@/components/graph/CommitGraphCanvas.vue';
import StagingPanel from '@/components/staging/StagingPanel.vue';
import CommitBox from '@/components/staging/CommitBox.vue';
import DiffViewer from '@/components/diff/DiffViewer.vue';
import AiAssistantModal from '@/components/ai/AiAssistantModal.vue';
import SettingsModal from '@/components/dialogs/SettingsModal.vue';
import AddRepoModal from '@/components/dialogs/AddRepoModal.vue';
import BranchModal from '@/components/dialogs/BranchModal.vue';
import TagModal from '@/components/dialogs/TagModal.vue';
import StashModal from '@/components/dialogs/StashModal.vue';
import MergeModal from '@/components/dialogs/MergeModal.vue';
import RebaseModal from '@/components/dialogs/RebaseModal.vue';
import ResetModal from '@/components/dialogs/ResetModal.vue';
import RenameBranchModal from '@/components/dialogs/RenameBranchModal.vue';
import ToastContainer from '@/components/ui/ToastContainer.vue';
import { useRepoStore } from '@/stores/repo';

const repoStore = useRepoStore();

onMounted(async () => {
  await repoStore.loadRepo();
});
</script>

<template>
  <div class="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden font-sans">
    <!-- Top Header -->
    <NavbarHeader />

    <!-- Actions Toolbar -->
    <MainToolbar />

    <!-- Main Workspace Container -->
    <div class="flex-1 flex overflow-hidden">
      <!-- 1. Left Sidebar Navigation -->
      <SidebarWorkspace />

      <!-- 2. Central & Right Workspace Layout -->
      <div class="flex-1 flex flex-col overflow-hidden">
        <!-- Top Half: Commit Graph Tree View -->
        <div class="h-1/2 flex flex-col overflow-hidden">
          <CommitGraphCanvas />
        </div>

        <!-- Bottom Half: Staging Panel + Commit Box + Diff Viewer -->
        <div class="h-1/2 flex overflow-hidden border-t border-border">
          <!-- Staging & Commit Area (Left) -->
          <div class="w-80 flex flex-col border-r border-border shrink-0">
            <div class="flex-1 overflow-hidden">
              <StagingPanel />
            </div>
            <CommitBox />
          </div>

          <!-- Diff Inspection Area (Right) -->
          <div class="flex-1 overflow-hidden">
            <DiffViewer />
          </div>
        </div>
      </div>
    </div>

    <!-- Modals -->
    <AddRepoModal />
    <BranchModal />
    <TagModal />
    <StashModal />
    <MergeModal />
    <RebaseModal />
    <ResetModal />
    <RenameBranchModal />
    <AiAssistantModal />
    <SettingsModal />

    <!-- Global Toast Container -->
    <ToastContainer />
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
