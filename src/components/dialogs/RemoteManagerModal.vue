<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { useNotificationStore } from '@/stores/notification';
import { useI18n } from '@/i18n';
import { GitFork, X, AlertCircle, Save, Link2 } from 'lucide-vue-next';

interface RemoteDraft {
  url: string;
  pushUrl: string;
}

const repoStore = useRepoStore();
const notification = useNotificationStore();
const { t } = useI18n();
const drafts = ref<Record<string, RemoteDraft>>({});
const isSubmitting = ref(false);
const errorMsg = ref<string | null>(null);

const hasChanges = computed(() => repoStore.remotes.some((remote) => {
  const draft = drafts.value[remote.name];
  return draft && (
    draft.url.trim() !== (remote.url || '')
    || draft.pushUrl.trim() !== (remote.push_url || '')
  );
}));

function syncDrafts() {
  drafts.value = Object.fromEntries(
    repoStore.remotes.map((remote) => [remote.name, {
      url: remote.url || '',
      pushUrl: remote.push_url || '',
    }]),
  );
}

watch(
  () => repoStore.isRemoteModalOpen,
  (isOpen) => {
    if (isOpen) {
      errorMsg.value = null;
      syncDrafts();
    }
  },
);

watch(
  () => repoStore.remotes,
  () => {
    if (repoStore.isRemoteModalOpen && !isSubmitting.value) syncDrafts();
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
    notification.success(t('Remote URLs Updated'), t('The remote configuration was saved.'));
    repoStore.isRemoteModalOpen = false;
  } catch (err: any) {
    errorMsg.value = err?.message || t('Failed to update remote URL');
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div
    v-if="repoStore.isRemoteModalOpen"
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
  >
    <div class="w-full max-w-2xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs">
      <div class="h-11 bg-muted/50 px-4 flex items-center justify-between border-b border-border select-none">
        <div class="flex items-center space-x-2">
          <GitFork class="w-4 h-4 text-primary" />
          <span class="font-bold text-sm text-foreground">{{ t('Git Remotes') }}</span>
        </div>
        <button
          @click="repoStore.isRemoteModalOpen = false"
          class="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition"
          :title="t('Close')"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <div class="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
        <div class="text-muted-foreground leading-relaxed">
          {{ t('Remote branches are listed in the left sidebar. Edit the repository Fetch URL here; leave Push URL empty to use the Fetch URL for pushing.') }}
        </div>

        <div
          v-if="errorMsg"
          class="p-2.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-center space-x-2"
        >
          <AlertCircle class="w-4 h-4 shrink-0" />
          <span>{{ errorMsg }}</span>
        </div>

        <div v-if="repoStore.remotes.length" class="border border-border rounded-lg overflow-hidden">
          <div class="grid grid-cols-[120px_1fr_1fr] gap-3 px-3 py-2 bg-muted/40 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            <span>{{ t('Name') }}</span>
            <span>{{ t('Fetch URL') }}</span>
            <span>{{ t('Push URL') }}</span>
          </div>
          <div
            v-for="remote in repoStore.remotes"
            :key="remote.name"
            class="grid grid-cols-[120px_1fr_1fr] gap-3 items-center px-3 py-2.5 border-t border-border"
          >
            <div class="flex items-center space-x-1.5 min-w-0">
              <Link2 class="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span class="font-semibold text-foreground truncate">{{ remote.name }}</span>
            </div>
            <input
              v-model="drafts[remote.name].url"
              type="text"
              placeholder="https://github.com/org/repo.git or git@github.com:org/repo.git"
              class="w-full min-w-0 bg-background border border-border rounded px-2.5 py-1.5 text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              v-model="drafts[remote.name].pushUrl"
              type="text"
              :placeholder="t('Same as Fetch URL')"
              class="w-full min-w-0 bg-background border border-border rounded px-2.5 py-1.5 text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
        <div v-else class="p-4 rounded-lg border border-dashed border-border text-center text-muted-foreground">
          {{ t('This repository has no configured remotes.') }}
        </div>
      </div>

      <div class="h-12 bg-muted/30 px-4 flex items-center justify-end space-x-2 border-t border-border">
        <button
          @click="repoStore.isRemoteModalOpen = false"
          class="px-3 py-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition"
        >
          {{ t('Cancel') }}
        </button>
        <button
          @click="handleSave"
          :disabled="!hasChanges || isSubmitting"
          class="px-4 py-1.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition disabled:opacity-40 flex items-center space-x-1.5"
        >
          <Save class="w-3.5 h-3.5" />
          <span>{{ isSubmitting ? t('Saving...') : t('Save Changes') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
