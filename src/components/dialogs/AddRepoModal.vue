<script setup lang="ts">
import { ref } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { useGitApi } from '@/composables/useGitApi';
import {
  FolderGit2,
  FolderPlus,
  Download,
  X,
  AlertCircle,
  FolderSearch,
} from 'lucide-vue-next';

const repoStore = useRepoStore();
const gitApi = useGitApi();

const activeTab = ref<'local' | 'clone' | 'init'>('local');

// Form models
const localPath = ref('');
const cloneUrl = ref('');
const cloneDestination = ref('');
const initPath = ref('');

const isSubmitting = ref(false);
const errorMsg = ref<string | null>(null);

async function handleAddLocal() {
  if (!localPath.value.trim()) return;
  isSubmitting.value = true;
  errorMsg.value = null;
  try {
    await repoStore.addRepo(localPath.value.trim());
    localPath.value = '';
    repoStore.isAddRepoModalOpen = false;
  } catch (err: any) {
    errorMsg.value = err?.message || 'Failed to add repository';
  } finally {
    isSubmitting.value = false;
  }
}

async function handleClone() {
  if (!cloneUrl.value.trim() || !cloneDestination.value.trim()) return;
  isSubmitting.value = true;
  errorMsg.value = null;
  try {
    const res = await gitApi.cloneRepo(cloneUrl.value.trim(), cloneDestination.value.trim());
    if (res.success) {
      await repoStore.addRepo(res.path);
      cloneUrl.value = '';
      cloneDestination.value = '';
      repoStore.isAddRepoModalOpen = false;
    }
  } catch (err: any) {
    errorMsg.value = err?.message || 'Failed to clone repository';
  } finally {
    isSubmitting.value = false;
  }
}

async function handleInit() {
  if (!initPath.value.trim()) return;
  isSubmitting.value = true;
  errorMsg.value = null;
  try {
    const res = await gitApi.initRepo(initPath.value.trim());
    if (res.success) {
      await repoStore.addRepo(res.path);
      initPath.value = '';
      repoStore.isAddRepoModalOpen = false;
    }
  } catch (err: any) {
    errorMsg.value = err?.message || 'Failed to initialize repository';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div
    v-if="repoStore.isAddRepoModalOpen"
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
  >
    <div
      class="w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs"
    >
      <!-- Header -->
      <div class="h-11 bg-muted/50 px-4 flex items-center justify-between border-b border-border select-none">
        <div class="flex items-center space-x-2">
          <FolderGit2 class="w-4 h-4 text-primary" />
          <span class="font-bold text-sm text-foreground">Add Repository</span>
        </div>
        <button
          @click="repoStore.isAddRepoModalOpen = false"
          class="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Navigation Tabs -->
      <div class="h-10 bg-muted/20 border-b border-border flex items-center px-4 space-x-2 select-none">
        <button
          @click="activeTab = 'local'"
          class="px-3 py-1.5 rounded-md font-medium transition flex items-center space-x-1.5"
          :class="activeTab === 'local' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'"
        >
          <FolderSearch class="w-3.5 h-3.5" />
          <span>Add Existing Local Repo</span>
        </button>
        <button
          @click="activeTab = 'clone'"
          class="px-3 py-1.5 rounded-md font-medium transition flex items-center space-x-1.5"
          :class="activeTab === 'clone' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'"
        >
          <Download class="w-3.5 h-3.5" />
          <span>Clone from Remote</span>
        </button>
        <button
          @click="activeTab = 'init'"
          class="px-3 py-1.5 rounded-md font-medium transition flex items-center space-x-1.5"
          :class="activeTab === 'init' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'"
        >
          <FolderPlus class="w-3.5 h-3.5" />
          <span>Create New Repo</span>
        </button>
      </div>

      <!-- Body Content -->
      <div class="p-5 space-y-4">
        <!-- Error Alert -->
        <div
          v-if="errorMsg"
          class="p-2.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-center space-x-2"
        >
          <AlertCircle class="w-4 h-4 shrink-0" />
          <span>{{ errorMsg }}</span>
        </div>

        <!-- 1. Tab: Local -->
        <div v-if="activeTab === 'local'" class="space-y-3">
          <div>
            <label class="text-[11px] font-semibold text-muted-foreground">Local Repository Path</label>
            <input
              v-model="localPath"
              type="text"
              placeholder="e.g. D:\Projects\my-app or /Users/username/repo"
              class="w-full bg-background border border-border rounded px-3 py-2 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              @keydown.enter="handleAddLocal"
            />
            <p class="text-[10px] text-muted-foreground mt-1">
              Select or paste the path to an existing Git repository directory on your computer.
            </p>
          </div>
        </div>

        <!-- 2. Tab: Clone -->
        <div v-else-if="activeTab === 'clone'" class="space-y-3">
          <div>
            <label class="text-[11px] font-semibold text-muted-foreground">Remote URL (HTTPS / SSH)</label>
            <input
              v-model="cloneUrl"
              type="text"
              placeholder="https://github.com/owner/repository.git"
              class="w-full bg-background border border-border rounded px-3 py-2 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label class="text-[11px] font-semibold text-muted-foreground">Destination Folder</label>
            <input
              v-model="cloneDestination"
              type="text"
              placeholder="e.g. D:\Projects\cloned-repo"
              class="w-full bg-background border border-border rounded px-3 py-2 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              @keydown.enter="handleClone"
            />
          </div>
        </div>

        <!-- 3. Tab: Init -->
        <div v-else-if="activeTab === 'init'" class="space-y-3">
          <div>
            <label class="text-[11px] font-semibold text-muted-foreground">New Repository Directory</label>
            <input
              v-model="initPath"
              type="text"
              placeholder="e.g. D:\Projects\new-project"
              class="w-full bg-background border border-border rounded px-3 py-2 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              @keydown.enter="handleInit"
            />
            <p class="text-[10px] text-muted-foreground mt-1">
              GITBX will create the folder if it doesn't exist and run `git init`.
            </p>
          </div>
        </div>
      </div>

      <!-- Footer CTA -->
      <div class="h-12 bg-muted/30 px-4 flex items-center justify-end space-x-2 border-t border-border">
        <button
          @click="repoStore.isAddRepoModalOpen = false"
          class="px-3 py-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition"
        >
          Cancel
        </button>

        <button
          v-if="activeTab === 'local'"
          @click="handleAddLocal"
          :disabled="!localPath.trim() || isSubmitting"
          class="px-4 py-1.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition disabled:opacity-40"
        >
          {{ isSubmitting ? 'Verifying...' : 'Add Repository' }}
        </button>

        <button
          v-else-if="activeTab === 'clone'"
          @click="handleClone"
          :disabled="!cloneUrl.trim() || !cloneDestination.trim() || isSubmitting"
          class="px-4 py-1.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition disabled:opacity-40"
        >
          {{ isSubmitting ? 'Cloning...' : 'Clone Repository' }}
        </button>

        <button
          v-else-if="activeTab === 'init'"
          @click="handleInit"
          :disabled="!initPath.trim() || isSubmitting"
          class="px-4 py-1.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition disabled:opacity-40"
        >
          {{ isSubmitting ? 'Initializing...' : 'Create & Open' }}
        </button>
      </div>
    </div>
  </div>
</template>
