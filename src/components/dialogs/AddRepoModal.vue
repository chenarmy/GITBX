<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { useGitApi } from '@/composables/useGitApi';
import {
  FolderGit2,
  FolderPlus,
  FolderOpen,
  Download,
  AlertCircle,
  FolderSearch,
  KeyRound,
  Eye,
  EyeOff,
} from 'lucide-vue-next';
import ArcoModal from '@/components/ui/ArcoModal.vue';
import { open } from '@tauri-apps/plugin-dialog';
import { useI18n } from '@/i18n';
import { formatGitError } from '@/api/common';

const repoStore = useRepoStore();
const gitApi = useGitApi();
const { t } = useI18n();

const activeTab = ref<'local' | 'clone' | 'init'>('local');

// Form models
const localPath = ref('');
const cloneUrl = ref('');
const cloneDestination = ref('');
const cloneUsername = ref('');
const clonePassword = ref('');
const showCloneAuth = ref(false);
const showClonePassword = ref(false);
const initPath = ref('');
const selectedGroup = ref('');

const availableGroups = computed(() => {
  const groups = [...repoStore.repoGroups];
  const seen = new Set(groups);
  for (const repo of repoStore.repoList) {
    if (repo.group && !seen.has(repo.group)) {
      seen.add(repo.group);
      groups.push(repo.group);
    }
  }
  if (repoStore.targetRepoGroupForAdd && !seen.has(repoStore.targetRepoGroupForAdd)) {
    groups.push(repoStore.targetRepoGroupForAdd);
  }
  return groups;
});

watch(
  () => [repoStore.isAddRepoModalOpen, repoStore.targetRepoGroupForAdd] as const,
  ([isOpen, targetGroup]) => {
    if (isOpen) {
      selectedGroup.value = targetGroup || '';
      errorMsg.value = null;
    } else {
      clonePassword.value = '';
      showClonePassword.value = false;
    }
  },
  { immediate: true },
);

const isSubmitting = ref(false);
const errorMsg = ref<string | null>(null);
const isDesktop = gitApi.isTauri();

type DirectoryField = 'local' | 'clone' | 'init';

function getDirectoryValue(field: DirectoryField) {
  if (field === 'local') return localPath.value;
  if (field === 'clone') return cloneDestination.value;
  return initPath.value;
}

function setDirectoryValue(field: DirectoryField, value: string) {
  if (field === 'local') localPath.value = value;
  else if (field === 'clone') cloneDestination.value = value;
  else initPath.value = value;
}

async function selectDirectory(field: DirectoryField) {
  errorMsg.value = null;
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: t('Select Folder'),
      defaultPath: getDirectoryValue(field).trim() || undefined,
    });
    if (typeof selected === 'string' && selected) setDirectoryValue(field, selected);
  } catch (err: any) {
    errorMsg.value = err?.message || t('Failed to select folder');
  }
}

async function handleAddLocal() {
  if (!localPath.value.trim()) return;
  isSubmitting.value = true;
  errorMsg.value = null;
  try {
    await repoStore.addRepo(localPath.value.trim(), selectedGroup.value.trim() || undefined);
    localPath.value = '';
    repoStore.closeModal('addRepo');
  } catch (err: any) {
    errorMsg.value = err?.message || t('Failed to add repository');
  } finally {
    isSubmitting.value = false;
  }
}

async function handleClone() {
  if (!cloneUrl.value.trim() || !cloneDestination.value.trim()) return;
  isSubmitting.value = true;
  errorMsg.value = null;
  try {
    const credentials =
      cloneUsername.value.trim() || clonePassword.value
        ? {
            username: cloneUsername.value.trim() || undefined,
            password: clonePassword.value || undefined,
          }
        : undefined;
    const res = await gitApi.cloneRepo(cloneUrl.value.trim(), cloneDestination.value.trim(), credentials);
    if (res.success) {
      await repoStore.addRepo(res.path, selectedGroup.value.trim() || undefined);
      cloneUrl.value = '';
      cloneDestination.value = '';
      cloneUsername.value = '';
      clonePassword.value = '';
      showCloneAuth.value = false;
      showClonePassword.value = false;
      repoStore.closeModal('addRepo');
    }
  } catch (err: any) {
    let cloneError = err;
    if (typeof err === 'string') {
      try { cloneError = JSON.parse(err); } catch { /* Plain text Git error. */ }
    }
    const formatted = formatGitError(err, t('Failed to clone repository'));
    const lower = formatted.toLowerCase();
    const isAuthError =
      cloneError?.code === 'AUTH_FAILED' ||
      lower.includes('401') ||
      lower.includes('403') ||
      lower.includes('authentication') ||
      lower.includes('credential') ||
      lower.includes('username') ||
      lower.includes('access denied') ||
      lower.includes('unauthorized');

    if (cloneError?.code === 'CLONE_DESTINATION_NOT_EMPTY') {
      errorMsg.value = t('Clone destination is not empty. Choose an empty folder or a new path. If the repository is already on this computer, add it as an existing local repository.');
    } else if (isAuthError) {
      showCloneAuth.value = true;
      errorMsg.value = t('Authentication required or failed. Enter your username and password / access token below, then retry.');
    } else {
      errorMsg.value = formatted;
    }
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
      await repoStore.addRepo(res.path, selectedGroup.value.trim() || undefined);
      initPath.value = '';
      repoStore.closeModal('addRepo');
    }
  } catch (err: any) {
    errorMsg.value = err?.message || t('Failed to initialize repository');
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <ArcoModal
    v-if="repoStore.isAddRepoModalOpen"
    :title="t('Add Repository')"
    max-width-class="max-w-lg"
    body-class="space-y-4"
    @close="repoStore.closeModal('addRepo')"
  >
    <template #icon>
      <FolderGit2 class="w-4 h-4" aria-hidden="true" />
    </template>

    <template #below-header>
      <div class="arco-tabs bg-[hsl(var(--arco-fill-1))] shrink-0 select-none">
        <button
          type="button"
          @click="activeTab = 'local'"
          class="arco-tab"
          :class="{ 'arco-tab-active': activeTab === 'local' }"
        >
          <FolderSearch class="w-3.5 h-3.5" />
          <span>{{ t('Add Existing Local Repo') }}</span>
        </button>
        <button
          type="button"
          @click="activeTab = 'clone'"
          class="arco-tab"
          :class="{ 'arco-tab-active': activeTab === 'clone' }"
        >
          <Download class="w-3.5 h-3.5" />
          <span>{{ t('Clone from Remote') }}</span>
        </button>
        <button
          type="button"
          @click="activeTab = 'init'"
          class="arco-tab"
          :class="{ 'arco-tab-active': activeTab === 'init' }"
        >
          <FolderPlus class="w-3.5 h-3.5" />
          <span>{{ t('Create New Repo') }}</span>
        </button>
      </div>
    </template>

    <!-- Error Alert -->
    <div v-if="errorMsg" class="arco-alert arco-alert-danger">
      <AlertCircle class="w-4 h-4 shrink-0" />
      <span>{{ errorMsg }}</span>
    </div>

    <!-- 1. Tab: Local -->
    <div v-if="activeTab === 'local'" class="space-y-3">
      <div>
        <label class="text-[11px] font-semibold text-muted-foreground">{{ t('Local Repository Path') }}</label>
        <div class="flex items-center space-x-2 mt-1.5">
          <input
            v-model="localPath"
            type="text"
            placeholder="e.g. D:\Projects\my-app or /Users/username/repo"
            class="arco-input min-w-0 flex-1"
            @keydown.enter="handleAddLocal"
          />
          <button
            v-if="isDesktop"
            type="button"
            :title="t('Select Folder')"
            class="arco-btn arco-btn-outline shrink-0"
            @click="selectDirectory('local')"
          >
            <FolderOpen class="w-3.5 h-3.5" />
            <span>{{ t('Browse') }}</span>
          </button>
        </div>
        <p class="text-[10px] text-muted-foreground mt-1.5">
          Select or paste the path to an existing Git repository directory on your computer.
        </p>
      </div>
    </div>

    <!-- 2. Tab: Clone -->
    <div v-else-if="activeTab === 'clone'" class="space-y-3">
      <div>
        <label class="text-[11px] font-semibold text-muted-foreground">{{ t('Remote URL (HTTPS / SSH)') }}</label>
        <input
          v-model="cloneUrl"
          type="text"
          placeholder="https://github.com/owner/repository.git"
          class="arco-input mt-1.5"
        />
      </div>
      <div>
        <label class="text-[11px] font-semibold text-muted-foreground">{{ t('Destination Folder') }}</label>
        <div class="flex items-center space-x-2 mt-1.5">
          <input
            v-model="cloneDestination"
            type="text"
            placeholder="e.g. D:\Projects\cloned-repo"
            class="arco-input min-w-0 flex-1"
            @keydown.enter="handleClone"
          />
          <button
            v-if="isDesktop"
            type="button"
            :title="t('Select Folder')"
            class="arco-btn arco-btn-outline shrink-0"
            @click="selectDirectory('clone')"
          >
            <FolderOpen class="w-3.5 h-3.5" />
            <span>{{ t('Browse') }}</span>
          </button>
        </div>
      </div>
      <div class="rounded-[6px] border border-border/80 bg-[hsl(var(--arco-fill-1))] p-2.5 space-y-2.5">
        <button
          type="button"
          class="w-full flex items-center justify-between text-[11px] font-semibold text-foreground hover:text-primary transition-colors"
          @click="showCloneAuth = !showCloneAuth"
        >
          <span class="flex items-center gap-1.5">
            <KeyRound class="w-3.5 h-3.5 text-primary" />
            <span>{{ t('Authentication Credentials (Optional)') }}</span>
          </span>
          <span class="text-[10px] text-primary">{{ showCloneAuth ? t('Hide') : t('Enter Username / Token') }}</span>
        </button>
        <div v-if="showCloneAuth" class="grid grid-cols-1 gap-2 pt-1 border-t border-border/70">
          <div>
            <label class="text-[11px] font-semibold text-muted-foreground">{{ t('Username') }}</label>
            <input
              v-model="cloneUsername"
              type="text"
              autocomplete="username"
              :placeholder="t('Git username or email')"
              class="arco-input mt-1"
            />
          </div>
          <div>
            <label class="text-[11px] font-semibold text-muted-foreground">{{ t('Password / Personal Access Token') }}</label>
            <div class="relative mt-1 flex items-center">
              <input
                v-model="clonePassword"
                :type="showClonePassword ? 'text' : 'password'"
                autocomplete="current-password"
                :placeholder="t('Password or personal access token')"
                class="arco-input pr-8"
                @keydown.enter="handleClone"
              />
              <button
                type="button"
                class="absolute right-2 text-muted-foreground hover:text-foreground transition-colors"
                :title="showClonePassword ? t('Hide') : t('Show')"
                @click="showClonePassword = !showClonePassword"
              >
                <EyeOff v-if="showClonePassword" class="w-3.5 h-3.5" />
                <Eye v-else class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. Tab: Init -->
    <div v-else-if="activeTab === 'init'" class="space-y-3">
      <div>
        <label class="text-[11px] font-semibold text-muted-foreground">{{ t('New Repository Directory') }}</label>
        <div class="flex items-center space-x-2 mt-1.5">
          <input
            v-model="initPath"
            type="text"
            placeholder="e.g. D:\Projects\new-project"
            class="arco-input min-w-0 flex-1"
            @keydown.enter="handleInit"
          />
          <button
            v-if="isDesktop"
            type="button"
            :title="t('Select Folder')"
            class="arco-btn arco-btn-outline shrink-0"
            @click="selectDirectory('init')"
          >
            <FolderOpen class="w-3.5 h-3.5" />
            <span>{{ t('Browse') }}</span>
          </button>
        </div>
        <p class="text-[10px] text-muted-foreground mt-1.5">
          GITBX will create the folder if it doesn't exist and run `git init`.
        </p>
      </div>
    </div>

    <!-- Optional Repository Group -->
    <div>
      <label class="text-[11px] font-semibold text-muted-foreground">{{ t('Repository Group (Optional)') }}</label>
      <input
        v-model="selectedGroup"
        type="text"
        list="gitbx-repo-groups-list"
        :placeholder="t('Select or enter a group name (leave empty for ungrouped)')"
        class="arco-input mt-1.5"
      />
      <datalist id="gitbx-repo-groups-list">
        <option v-for="group in availableGroups" :key="group" :value="group" />
      </datalist>
    </div>

    <template #footer>
      <button
        type="button"
        @click="repoStore.closeModal('addRepo')"
        class="arco-btn arco-btn-secondary"
      >
        {{ t('Cancel') }}
      </button>

      <button
        v-if="activeTab === 'local'"
        type="button"
        @click="handleAddLocal"
        :disabled="!localPath.trim() || isSubmitting"
        class="arco-btn arco-btn-primary"
      >
        {{ isSubmitting ? 'Verifying...' : t('Add Repository') }}
      </button>

      <button
        v-else-if="activeTab === 'clone'"
        type="button"
        @click="handleClone"
        :disabled="!cloneUrl.trim() || !cloneDestination.trim() || isSubmitting"
        class="arco-btn arco-btn-primary"
      >
        {{ isSubmitting ? 'Cloning...' : t('Clone') }}
      </button>

      <button
        v-else-if="activeTab === 'init'"
        type="button"
        @click="handleInit"
        :disabled="!initPath.trim() || isSubmitting"
        class="arco-btn arco-btn-primary"
      >
        {{ isSubmitting ? 'Initializing...' : t('Create New Repo') }}
      </button>
    </template>
  </ArcoModal>
</template>
