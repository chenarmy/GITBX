<script setup lang="ts">
import { ref, watch } from 'vue';
import { History, Plus, RotateCcw } from 'lucide-vue-next';
import ArcoModal from '@/components/ui/ArcoModal.vue';
import { useRepoStore } from '@/stores/repo'; import { useDiffStore } from '@/stores/diff'; import { useConfirmationStore } from '@/stores/confirmation'; import { useNotificationStore } from '@/stores/notification';
import { useGitApi, formatGitError } from '@/composables/useGitApi'; import { useI18n } from '@/i18n'; import type { LocalHistoryEntry } from '@/types/git';
const repoStore = useRepoStore(); const diffStore = useDiffStore(); const confirmation = useConfirmationStore(); const notification = useNotificationStore(); const api = useGitApi(); const { t } = useI18n();
const entries = ref<LocalHistoryEntry[]>([]); const selected = ref<LocalHistoryEntry | null>(null); const content = ref(''); const label = ref('Manual snapshot'); const error = ref('');
async function refresh() { if (!diffStore.selectedFile) return; try { entries.value = await api.listLocalHistory(repoStore.activeRepoPath, diffStore.selectedFile); if (entries.value[0]) await select(entries.value[0]); } catch (e) { error.value = formatGitError(e); } }
async function select(entry: LocalHistoryEntry) { selected.value = entry; try { content.value = await api.readLocalHistory(repoStore.activeRepoPath, entry.file_path, entry.id); } catch (e) { content.value = formatGitError(e); } }
async function create() { if (!diffStore.selectedFile) return; try { await api.createLocalHistorySnapshot(repoStore.activeRepoPath, diffStore.selectedFile, label.value); await refresh(); } catch (e) { error.value = formatGitError(e); } }
async function restore() { if (!selected.value || !diffStore.selectedFile) return; const ok = await confirmation.confirm({ title: t('Restore Local History'), message: t('Restore this snapshot? The current file will be saved as a new snapshot first.'), danger: true, confirmText: t('Restore') }); if (!ok) return; try { await api.restoreLocalHistory(repoStore.activeRepoPath, diffStore.selectedFile, selected.value.id); await repoStore.loadRepo(); await diffStore.selectFile(diffStore.selectedFile, false, repoStore.activeRepoPath); notification.success(t('Snapshot Restored'), diffStore.selectedFile); diffStore.isLocalHistoryOpen = false; } catch (e) { error.value = formatGitError(e); } }
watch(() => diffStore.isLocalHistoryOpen, (open) => { if (open) void refresh(); });
</script>
<template>
  <ArcoModal
    v-if="diffStore.isLocalHistoryOpen"
    :title="t('Local History')"
    :subtitle="diffStore.selectedFile || ''"
    max-width-class="max-w-5xl"
    height-class="h-[72vh]"
    raw-body
    @close="diffStore.isLocalHistoryOpen = false"
  >
    <template #icon>
      <History class="w-4 h-4" aria-hidden="true" />
    </template>

    <template #below-header>
      <div class="px-5 py-3 border-b border-border/80 bg-[hsl(var(--arco-fill-1))] flex gap-2 shrink-0">
        <input v-model="label" class="arco-input arco-input-sm flex-1" />
        <button type="button" class="arco-btn arco-btn-primary arco-btn-sm" @click="create">
          <Plus class="w-3.5 h-3.5" aria-hidden="true" />{{ t('Create Snapshot') }}
        </button>
        <button
          type="button"
          class="arco-btn arco-btn-outline arco-btn-sm"
          :disabled="!selected"
          @click="restore"
        >
          <RotateCcw class="w-3.5 h-3.5" aria-hidden="true" />{{ t('Restore') }}
        </button>
      </div>
    </template>

    <div v-if="error" class="arco-alert arco-alert-danger m-4 shrink-0">{{ error }}</div>

    <div class="flex-1 min-h-0 grid grid-cols-[280px_1fr]">
      <div class="border-r border-border/80 bg-[hsl(var(--arco-fill-1))] overflow-auto divide-y divide-border/70">
        <button
          v-for="entry in entries"
          :key="entry.id"
          type="button"
          class="w-full text-left px-3.5 py-2.5 transition-colors hover:bg-accent/55"
          :class="selected?.id === entry.id ? 'bg-primary/[0.08] border-l-2 border-l-primary' : ''"
          @click="select(entry)"
        >
          <div class="font-semibold text-foreground truncate">{{ entry.label }}</div>
          <div class="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
            {{ new Date(entry.timestamp * 1000).toLocaleString() }} · {{ entry.size }} B
          </div>
        </button>
        <div v-if="entries.length === 0" class="p-8 text-center text-muted-foreground">
          {{ t('No local history snapshots.') }}
        </div>
      </div>
      <pre class="overflow-auto p-4 font-mono text-[11px] leading-relaxed whitespace-pre bg-background text-foreground">{{ content }}</pre>
    </div>
  </ArcoModal>
</template>
