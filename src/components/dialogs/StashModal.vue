<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Archive, X, AlertCircle, Play, Trash2, Pencil, Eye, Layers } from 'lucide-vue-next';
import { useRepoStore } from '@/stores/repo';
import { useConfirmationStore } from '@/stores/confirmation';
import { useGitApi, formatGitError } from '@/composables/useGitApi';
import { useI18n } from '@/i18n';
import type { FileStatusItem, StashItem } from '@/types/git';

const repoStore = useRepoStore();
const confirmation = useConfirmationStore();
const gitApi = useGitApi();
const { t } = useI18n();
const stashMessage = ref('');
const mode = ref<'stash' | 'shelf'>('stash');
const selectedPaths = ref<string[]>([]);
const selectedStash = ref<StashItem | null>(null);
const stashFiles = ref<FileStatusItem[]>([]);
const renameMessage = ref('');
const isSubmitting = ref(false);
const errorMsg = ref<string | null>(null);
const stashRef = (index: number) => `stash@{${index}}`;

const changedFiles = computed(() => {
  const all = [...repoStore.statusSummary.staged_files, ...repoStore.statusSummary.unstaged_files, ...repoStore.statusSummary.untracked_files];
  return [...new Map(all.map((file) => [file.path, file])).values()];
});

watch(() => repoStore.isStashModalOpen, (open) => {
  if (!open) return;
  errorMsg.value = null;
  selectedStash.value = repoStore.stashes[0] || null;
  selectedPaths.value = changedFiles.value.map((file) => file.path);
  if (selectedStash.value) void inspectStash(selectedStash.value);
});

async function run(action: () => Promise<void>) {
  isSubmitting.value = true;
  errorMsg.value = null;
  try { await action(); } catch (error) { errorMsg.value = formatGitError(error); } finally { isSubmitting.value = false; }
}

async function handleSave() {
  await run(async () => {
    if (mode.value === 'shelf') await repoStore.createShelf(stashMessage.value, selectedPaths.value);
    else await repoStore.createStash(stashMessage.value.trim() || undefined);
    stashMessage.value = '';
    selectedStash.value = repoStore.stashes[0] || null;
    if (selectedStash.value) await inspectStash(selectedStash.value);
  });
}

async function inspectStash(stash: StashItem) {
  selectedStash.value = stash;
  renameMessage.value = stash.message;
  await run(async () => { stashFiles.value = await gitApi.getStashChanges(repoStore.activeRepoPath, stash.commit_id); });
}

async function applySelected(pop: boolean) {
  if (!selectedStash.value) return;
  await run(async () => {
    if (pop) await repoStore.popStash(selectedStash.value!.index); else await repoStore.applyStash(selectedStash.value!.index);
    selectedStash.value = repoStore.stashes[0] || null;
    if (selectedStash.value) await inspectStash(selectedStash.value); else stashFiles.value = [];
  });
}

async function renameSelected() {
  if (!selectedStash.value || !renameMessage.value.trim()) return;
  await run(async () => {
    await repoStore.renameStash(selectedStash.value!.index, renameMessage.value.trim());
    selectedStash.value = repoStore.stashes[0] || null;
    if (selectedStash.value) await inspectStash(selectedStash.value);
  });
}

async function dropSelected() {
  if (!selectedStash.value) return;
  const approved = await confirmation.confirm({ title: t('Drop Stash'), message: t('Permanently delete the selected stash?'), danger: true, confirmText: t('Drop') });
  if (!approved) return;
  await run(async () => {
    await repoStore.dropStash(selectedStash.value!.index);
    selectedStash.value = repoStore.stashes[0] || null;
    if (selectedStash.value) await inspectStash(selectedStash.value); else stashFiles.value = [];
  });
}
</script>

<template>
  <div v-if="repoStore.isStashModalOpen" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="w-full max-w-5xl h-[76vh] bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs">
      <div class="h-11 bg-muted/50 px-4 flex items-center justify-between border-b border-border">
        <div class="flex items-center gap-2"><Archive class="w-4 h-4 text-orange-400" /><span class="font-bold text-sm">{{ t('Stash and Shelf Manager') }}</span></div>
        <button class="p-1 rounded hover:bg-accent text-muted-foreground" @click="repoStore.isStashModalOpen = false"><X class="w-4 h-4" /></button>
      </div>
      <div v-if="errorMsg" class="m-3 mb-0 p-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-500 flex gap-2"><AlertCircle class="w-4 h-4" />{{ errorMsg }}</div>
      <div class="flex-1 min-h-0 grid grid-cols-[300px_1fr]">
        <div class="border-r border-border flex flex-col min-h-0">
          <div class="p-3 border-b border-border space-y-2">
            <div class="flex bg-muted rounded p-0.5">
              <button v-for="item in (['stash', 'shelf'] as const)" :key="item" class="flex-1 py-1 rounded" :class="mode === item ? 'bg-card shadow text-primary' : 'text-muted-foreground'" @click="mode = item">{{ t(item === 'stash' ? 'Full Stash' : 'Shelf Selected Files') }}</button>
            </div>
            <input v-model="stashMessage" class="w-full bg-background border border-border rounded px-2 py-1.5" :placeholder="t('Stash Message (Optional)')" />
            <div v-if="mode === 'shelf'" class="max-h-32 overflow-auto border border-border rounded divide-y divide-border">
              <label v-for="file in changedFiles" :key="file.path" class="flex gap-2 px-2 py-1 hover:bg-accent"><input v-model="selectedPaths" type="checkbox" :value="file.path" /><span class="truncate font-mono">{{ file.path }}</span></label>
            </div>
            <button class="w-full py-1.5 rounded bg-primary text-primary-foreground font-semibold disabled:opacity-40" :disabled="isSubmitting || (mode === 'shelf' && selectedPaths.length === 0)" @click="handleSave">{{ t(mode === 'stash' ? 'Save Stash' : 'Create Shelf') }}</button>
          </div>
          <div class="px-3 py-2 font-bold text-muted-foreground uppercase text-[10px]">{{ t('Saved Stashes and Shelves') }}</div>
          <div class="flex-1 overflow-auto divide-y divide-border">
            <button v-for="stash in repoStore.stashes" :key="stash.commit_id" class="w-full text-left px-3 py-2 hover:bg-accent" :class="selectedStash?.commit_id === stash.commit_id ? 'bg-accent' : ''" @click="inspectStash(stash)">
              <div class="flex items-center gap-2"><Layers class="w-3.5 h-3.5 text-orange-400" /><span class="truncate font-semibold">{{ stash.message }}</span></div>
              <div class="font-mono text-[10px] text-muted-foreground mt-1">{{ stashRef(stash.index) }} · {{ stash.commit_id.slice(0, 8) }}</div>
            </button>
            <div v-if="repoStore.stashes.length === 0" class="p-6 text-center text-muted-foreground">{{ t('No saved stashes or shelves.') }}</div>
          </div>
        </div>

        <div class="flex flex-col min-h-0">
          <div v-if="selectedStash" class="p-3 border-b border-border flex gap-2 items-center">
            <input v-model="renameMessage" class="flex-1 bg-background border border-border rounded px-2 py-1.5" />
            <button class="action" @click="renameSelected"><Pencil class="w-3.5 h-3.5" />{{ t('Rename') }}</button>
            <button class="action" @click="applySelected(false)"><Eye class="w-3.5 h-3.5" />{{ t('Apply and Keep') }}</button>
            <button class="action text-primary" @click="applySelected(true)"><Play class="w-3.5 h-3.5" />{{ t('Pop') }}</button>
            <button class="action text-rose-500" @click="dropSelected"><Trash2 class="w-3.5 h-3.5" />{{ t('Drop') }}</button>
          </div>
          <div class="grid grid-cols-[1fr_100px] px-3 py-2 bg-muted/40 font-bold text-[10px] uppercase text-muted-foreground"><span>{{ t('Files in Stash') }}</span><span>{{ t('Status') }}</span></div>
          <div class="flex-1 overflow-auto divide-y divide-border">
            <div v-for="file in stashFiles" :key="file.path" class="grid grid-cols-[1fr_100px] px-3 py-2 font-mono"><span class="truncate">{{ file.path }}</span><span class="text-primary">{{ file.staged_status }}</span></div>
            <div v-if="selectedStash && stashFiles.length === 0" class="p-8 text-center text-muted-foreground">{{ t('This stash contains no file changes.') }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.action { @apply px-2 py-1.5 rounded border border-border hover:bg-accent flex items-center gap-1 whitespace-nowrap; }
</style>
