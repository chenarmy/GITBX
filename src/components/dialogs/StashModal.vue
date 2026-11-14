<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Archive, AlertCircle, Play, Trash2, Pencil, Eye, Layers } from 'lucide-vue-next';
import ArcoModal from '@/components/ui/ArcoModal.vue';
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
  <ArcoModal
    v-if="repoStore.isStashModalOpen"
    :title="t('Stash and Shelf Manager')"
    max-width-class="max-w-5xl"
    height-class="h-[76vh]"
    icon-bg-class="bg-orange-500/10 text-orange-500"
    raw-body
    @close="repoStore.closeModal('stash')"
  >
    <template #icon>
      <Archive class="w-4 h-4" aria-hidden="true" />
    </template>

    <div v-if="errorMsg" class="arco-alert arco-alert-danger m-4 mb-0 shrink-0">
      <AlertCircle class="w-4 h-4 shrink-0" />
      <span>{{ errorMsg }}</span>
    </div>

    <div class="flex-1 min-h-0 grid grid-cols-[310px_1fr]">
      <div class="border-r border-border/80 bg-[hsl(var(--arco-fill-1))] flex flex-col min-h-0">
        <div class="p-3.5 border-b border-border/80 space-y-2.5">
          <div class="arco-segmented w-full">
            <button
              v-for="item in (['stash', 'shelf'] as const)"
              :key="item"
              type="button"
              class="arco-segmented-item flex-1"
              :class="{ 'arco-segmented-item-active': mode === item }"
              @click="mode = item"
            >
              {{ t(item === 'stash' ? 'Full Stash' : 'Shelf Selected Files') }}
            </button>
          </div>
          <input
            v-model="stashMessage"
            class="arco-input arco-input-sm"
            :placeholder="t('Stash Message (Optional)')"
          />
          <div
            v-if="mode === 'shelf'"
            class="max-h-32 overflow-auto border border-border/80 bg-card rounded-[6px] divide-y divide-border/70"
          >
            <label
              v-for="file in changedFiles"
              :key="file.path"
              class="flex items-center gap-2 px-2.5 py-1.5 hover:bg-accent/55 cursor-pointer"
            >
              <input v-model="selectedPaths" type="checkbox" :value="file.path" class="accent-[hsl(var(--primary))]" />
              <span class="truncate font-mono text-[11px]">{{ file.path }}</span>
            </label>
          </div>
          <button
            type="button"
            class="arco-btn arco-btn-primary w-full"
            :disabled="isSubmitting || (mode === 'shelf' && selectedPaths.length === 0)"
            @click="handleSave"
          >
            {{ t(mode === 'stash' ? 'Save Stash' : 'Create Shelf') }}
          </button>
        </div>

        <div class="px-3.5 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px] border-b border-border/70 bg-[hsl(var(--arco-fill-2))]">
          {{ t('Saved Stashes and Shelves') }}
        </div>

        <div class="flex-1 overflow-auto divide-y divide-border/70">
          <button
            v-for="stash in repoStore.stashes"
            :key="stash.commit_id"
            type="button"
            class="w-full text-left px-3.5 py-2.5 hover:bg-accent/55 transition-colors"
            :class="selectedStash?.commit_id === stash.commit_id ? 'bg-primary/[0.08] border-l-2 border-l-primary' : ''"
            @click="inspectStash(stash)"
          >
            <div class="flex items-center gap-2">
              <Layers class="w-3.5 h-3.5 text-orange-500 shrink-0" />
              <span class="truncate font-semibold text-foreground">{{ stash.message }}</span>
            </div>
            <div class="font-mono text-[10px] text-muted-foreground mt-1">
              {{ stashRef(stash.index) }} · {{ stash.commit_id.slice(0, 8) }}
            </div>
          </button>
          <div v-if="repoStore.stashes.length === 0" class="p-6 text-center text-muted-foreground">
            {{ t('No saved stashes or shelves.') }}
          </div>
        </div>
      </div>

      <div class="flex flex-col min-h-0">
        <div v-if="selectedStash" class="p-3.5 border-b border-border/80 bg-[hsl(var(--arco-fill-1))] flex flex-wrap gap-2 items-center shrink-0">
          <input v-model="renameMessage" class="arco-input arco-input-sm flex-1 min-w-[160px]" />
          <button type="button" class="arco-btn arco-btn-outline arco-btn-sm" @click="renameSelected">
            <Pencil class="w-3.5 h-3.5" />{{ t('Rename') }}
          </button>
          <button type="button" class="arco-btn arco-btn-outline arco-btn-sm" @click="applySelected(false)">
            <Eye class="w-3.5 h-3.5" />{{ t('Apply and Keep') }}
          </button>
          <button type="button" class="arco-btn arco-btn-primary arco-btn-sm" @click="applySelected(true)">
            <Play class="w-3.5 h-3.5" />{{ t('Pop') }}
          </button>
          <button type="button" class="arco-btn arco-btn-danger-outline arco-btn-sm" @click="dropSelected">
            <Trash2 class="w-3.5 h-3.5" />{{ t('Drop') }}
          </button>
        </div>

        <div class="grid grid-cols-[1fr_110px] px-4 py-2 bg-[hsl(var(--arco-fill-2))] border-b border-border/80 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
          <span>{{ t('Files in Stash') }}</span>
          <span>{{ t('Status') }}</span>
        </div>

        <div class="flex-1 overflow-auto divide-y divide-border/70">
          <div
            v-for="file in stashFiles"
            :key="file.path"
            class="grid grid-cols-[1fr_110px] px-4 py-2.5 font-mono items-center hover:bg-accent/40 transition-colors"
          >
            <span class="truncate text-foreground">{{ file.path }}</span>
            <span>
              <span class="arco-tag arco-tag-primary">{{ file.staged_status }}</span>
            </span>
          </div>
          <div v-if="selectedStash && stashFiles.length === 0" class="p-8 text-center text-muted-foreground">
            {{ t('This stash contains no file changes.') }}
          </div>
        </div>
      </div>
    </div>
  </ArcoModal>
</template>
