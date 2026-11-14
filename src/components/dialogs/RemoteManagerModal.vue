<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { useNotificationStore } from '@/stores/notification';
import { useI18n } from '@/i18n';
import { GitFork, AlertCircle, Save, Link2, KeyRound, FolderOpen } from 'lucide-vue-next';
import ArcoModal from '@/components/ui/ArcoModal.vue';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { useGitApi } from '@/composables/useGitApi';

interface RemoteDraft {
  url: string;
  pushUrl: string;
}

const repoStore = useRepoStore();
const notification = useNotificationStore();
const { t } = useI18n();
const gitApi = useGitApi();
const drafts = ref<Record<string, RemoteDraft>>({});
const repositorySshKey = ref('');
const originalRepositorySshKey = ref('');
const repositorySshPassphrase = ref('');
const isSubmitting = ref(false);
const errorMsg = ref<string | null>(null);

const hasChanges = computed(() => Boolean(repositorySshPassphrase.value)
  || repositorySshKey.value.trim() !== originalRepositorySshKey.value
  || repoStore.remotes.some((remote) => {
    const draft = drafts.value[remote.name];
    return draft && (
      draft.url.trim() !== (remote.url || '')
      || draft.pushUrl.trim() !== (remote.push_url || '')
    );
  }));

async function syncDrafts() {
  drafts.value = Object.fromEntries(
    repoStore.remotes.map((remote) => [remote.name, {
      url: remote.url || '',
      pushUrl: remote.push_url || '',
    }]),
  );
  const key = await gitApi.getRepositorySshKey(repoStore.activeRepoPath).catch(() => null);
  repositorySshKey.value = key || '';
  originalRepositorySshKey.value = key || '';
  repositorySshPassphrase.value = '';
}

watch(
  () => repoStore.isRemoteModalOpen,
  (isOpen) => {
    if (isOpen) {
      errorMsg.value = null;
      void syncDrafts();
    }
  },
);

watch(
  () => repoStore.remotes,
  () => {
    if (repoStore.isRemoteModalOpen && !isSubmitting.value) void syncDrafts();
  },
  { deep: true },
);

async function handleSave() {
  const updates = repoStore.remotes.filter((remote) => {
    const draft = drafts.value[remote.name];
    return draft && (draft.url.trim() !== (remote.url || '') || draft.pushUrl.trim() !== (remote.push_url || ''));
  });
  if (updates.some((remote) => !drafts.value[remote.name]?.url.trim())) {
    errorMsg.value = t('Fetch URL cannot be empty.');
    return;
  }

  isSubmitting.value = true;
  errorMsg.value = null;
  try {
    for (const remote of updates) {
      const draft = drafts.value[remote.name];
      await repoStore.updateRemoteUrl(remote.name, draft.url, draft.pushUrl);
    }
    if (repositorySshKey.value.trim() !== originalRepositorySshKey.value) {
      let normalizedKey = repositorySshKey.value.trim();
      if (normalizedKey && repositorySshPassphrase.value) {
        normalizedKey = await gitApi.saveSshPassphrase(normalizedKey, repositorySshPassphrase.value);
      }
      await gitApi.setRepositorySshKey(repoStore.activeRepoPath, normalizedKey);
    } else if (repositorySshKey.value.trim() && repositorySshPassphrase.value) {
      await gitApi.saveSshPassphrase(repositorySshKey.value, repositorySshPassphrase.value);
    }
    notification.success(t('Remote URLs Updated'), t('The remote configuration was saved.'));
    repoStore.closeModal('remote');
  } catch (err: any) {
    errorMsg.value = err?.message || t('Failed to update remote URL');
  } finally {
    isSubmitting.value = false;
  }
}

async function selectRepositorySshKey() {
  const selected = await openDialog({
    multiple: false,
    directory: false,
    title: t('Select SSH Private Key'),
  });
  if (typeof selected === 'string') repositorySshKey.value = selected;
}
</script>

<template>
  <ArcoModal
    v-if="repoStore.isRemoteModalOpen"
    :title="t('Git Remotes')"
    max-width-class="max-w-2xl"
    height-class="max-h-[82vh]"
    body-class="space-y-4"
    @close="repoStore.closeModal('remote')"
  >
    <template #icon>
      <GitFork class="w-4 h-4" aria-hidden="true" />
    </template>

    <div class="text-[12px] text-muted-foreground leading-relaxed">
      {{ t('Remote branches are listed in the left sidebar. Edit the repository Fetch URL here; leave Push URL empty to use the Fetch URL for pushing.') }}
    </div>

    <div class="space-y-2.5 rounded-[8px] border border-border/80 bg-[hsl(var(--arco-fill-1))] p-3.5">
      <div class="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
        <KeyRound class="h-3.5 w-3.5 text-[hsl(var(--arco-success))]" />
        {{ t('Repository SSH Key') }}
      </div>
      <div class="flex items-center gap-2">
        <input
          v-model="repositorySshKey"
          :placeholder="t('Inherit the global SSH key when empty')"
          class="arco-input min-w-0 flex-1 font-mono"
        />
        <button type="button" class="arco-btn arco-btn-outline" @click="selectRepositorySshKey">
          <FolderOpen class="h-3.5 w-3.5" />{{ t('Browse') }}
        </button>
        <button v-if="repositorySshKey" type="button" class="arco-btn arco-btn-text" @click="repositorySshKey = ''">
          {{ t('Use Global') }}
        </button>
      </div>
      <div v-if="repositorySshKey">
        <label class="text-[11px] font-medium text-muted-foreground">{{ t('SSH Key Passphrase') }}</label>
        <input
          v-model="repositorySshPassphrase"
          type="password"
          :placeholder="t('Leave blank to keep the saved passphrase')"
          autocomplete="new-password"
          class="arco-input mt-1"
        />
      </div>
      <p class="text-[10px] text-muted-foreground">{{ t('This key overrides the global SSH key for this repository only.') }}</p>
    </div>

    <div v-if="errorMsg" class="arco-alert arco-alert-danger">
      <AlertCircle class="w-4 h-4 shrink-0" />
      <span>{{ errorMsg }}</span>
    </div>

    <div v-if="repoStore.remotes.length" class="arco-card rounded-[6px] overflow-hidden">
      <div class="grid grid-cols-[120px_1fr_1fr] gap-3 px-3.5 py-2 bg-[hsl(var(--arco-fill-2))] border-b border-border/80 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        <span>{{ t('Name') }}</span>
        <span>{{ t('Fetch URL') }}</span>
        <span>{{ t('Push URL') }}</span>
      </div>
      <div
        v-for="remote in repoStore.remotes"
        :key="remote.name"
        class="grid grid-cols-[120px_1fr_1fr] gap-3 items-center px-3.5 py-2.5 border-t border-border/80 first:border-t-0"
      >
        <div class="flex items-center space-x-1.5 min-w-0">
          <Link2 class="w-3.5 h-3.5 text-[hsl(var(--arco-success))] shrink-0" />
          <span class="font-semibold text-foreground truncate">{{ remote.name }}</span>
        </div>
        <input
          v-model="drafts[remote.name].url"
          type="text"
          placeholder="https://github.com/org/repo.git or git@github.com:org/repo.git"
          class="arco-input arco-input-sm min-w-0 font-mono"
        />
        <input
          v-model="drafts[remote.name].pushUrl"
          type="text"
          :placeholder="t('Same as Fetch URL')"
          class="arco-input arco-input-sm min-w-0 font-mono"
        />
      </div>
    </div>
    <div v-else class="p-5 rounded-[8px] border border-dashed border-border text-center text-muted-foreground">
      {{ t('This repository has no configured remotes.') }}
    </div>

    <template #footer>
      <button
        type="button"
        @click="repoStore.closeModal('remote')"
        class="arco-btn arco-btn-secondary"
      >
        {{ t('Cancel') }}
      </button>
      <button
        type="button"
        @click="handleSave"
        :disabled="!hasChanges || isSubmitting"
        class="arco-btn arco-btn-primary"
      >
        <Save class="w-3.5 h-3.5" />
        <span>{{ isSubmitting ? t('Saving...') : t('Save Changes') }}</span>
      </button>
    </template>
  </ArcoModal>
</template>
