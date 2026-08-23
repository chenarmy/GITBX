<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { AlertTriangle, Check, FileWarning, LoaderCircle, Sparkles, X } from 'lucide-vue-next';
import { formatGitError, useGitApi } from '@/composables/useGitApi';
import { useDiffStore } from '@/stores/diff';
import { useNotificationStore } from '@/stores/notification';
import { useRepoStore } from '@/stores/repo';
import { useAiStore } from '@/stores/ai';
import type { ConflictChunk, ConflictFileContent } from '@/types/diff';
import { useI18n } from '@/i18n';

const gitApi = useGitApi();
const diffStore = useDiffStore();
const repoStore = useRepoStore();
const aiStore = useAiStore();
const notification = useNotificationStore();
const { t } = useI18n();

const conflict = ref<ConflictFileContent | null>(null);
const resolutions = ref<Array<string | null>>([]);
const isLoading = ref(false);
const isSaving = ref(false);
const isAiAnalyzing = ref(false);
const errorMessage = ref('');

function getConflictSection(chunk: ConflictChunk) {
  return typeof chunk.section_type === 'object' ? chunk.section_type.Conflict : null;
}

const conflictIndexes = computed(() =>
  (conflict.value?.chunks ?? [])
    .map((chunk, index) => (getConflictSection(chunk) ? index : -1))
    .filter((index) => index >= 0)
);

const unresolvedCount = computed(() =>
  conflictIndexes.value.filter((index) => resolutions.value[index] === null).length
);

function combineBoth(ours: string, theirs: string) {
  if (!ours) return theirs;
  if (!theirs) return ours;
  const separator = ours.endsWith('\n') || theirs.startsWith('\n') ? '' : '\n';
  return `${ours}${separator}${theirs}`;
}

function choose(index: number, side: 'ours' | 'theirs' | 'both') {
  const section = conflict.value ? getConflictSection(conflict.value.chunks[index]) : null;
  if (!section) return;
  resolutions.value[index] = side === 'ours'
    ? section.ours
    : side === 'theirs'
      ? section.theirs
      : combineBoth(section.ours, section.theirs);
}

function chooseAll(side: 'ours' | 'theirs') {
  conflictIndexes.value.forEach((index) => choose(index, side));
}

function buildResolvedContent() {
  return (conflict.value?.chunks ?? [])
    .map((chunk, index) => {
      if (chunk.section_type === 'Normal') return chunk.resolved_content ?? '';
      return resolutions.value[index] ?? '';
    })
    .join('');
}

async function loadConflict() {
  const filePath = diffStore.selectedConflictFile;
  const repoPath = repoStore.activeRepoPath;
  if (!filePath || !repoPath) return;

  isLoading.value = true;
  errorMessage.value = '';
  try {
    const data = await gitApi.getConflictFile(repoPath, filePath);
    conflict.value = data;
    resolutions.value = data.chunks.map((chunk) =>
      chunk.section_type === 'Normal' ? (chunk.resolved_content ?? '') : null
    );
  } catch (error) {
    conflict.value = null;
    errorMessage.value = formatGitError(error, t('Failed to load conflict'));
  } finally {
    isLoading.value = false;
  }
}

async function finishResolution(options: { content?: string; side?: 'ours' | 'theirs' }) {
  const filePath = diffStore.selectedConflictFile;
  if (!filePath || !repoStore.activeRepoPath) return;
  isSaving.value = true;
  errorMessage.value = '';
  try {
    await gitApi.resolveConflict(repoStore.activeRepoPath, filePath, options);
    await repoStore.loadRepo(repoStore.activeRepoPath);
    const next = repoStore.statusSummary.conflicted_files[0]?.path;
    if (next) diffStore.selectConflictFile(next);
    else diffStore.clearSelection();
    notification.success(t('Conflict Resolved'), filePath);
  } catch (error) {
    errorMessage.value = formatGitError(error, t('Failed to resolve conflict'));
  } finally {
    isSaving.value = false;
  }
}

async function saveTextResolution() {
  if (unresolvedCount.value > 0) {
    errorMessage.value = t('Resolve every conflict block before saving.');
    return;
  }
  await finishResolution({ content: buildResolvedContent() });
}

async function handleAiAnalyze() {
  const filePath = diffStore.selectedConflictFile;
  if (!filePath || !conflict.value) return;
  isAiAnalyzing.value = true;
  errorMessage.value = '';
  try {
    const firstSection = conflictIndexes.value
      .map((i) => getConflictSection(conflict.value!.chunks[i]))
      .find((s) => s !== null);
    if (!firstSection) return;
    const res = await gitApi.analyzeConflict(
      filePath,
      firstSection.ours,
      firstSection.theirs,
      firstSection.base ?? undefined,
      aiStore.llmConfig
    );
    if (res.suggested_content) {
      conflictIndexes.value.forEach((idx) => {
        resolutions.value[idx] = res.suggested_content;
      });
      notification.success(t('AI Suggestion Applied'), res.explanation);
    }
  } catch (error: any) {
    errorMessage.value = formatGitError(error, t('AI Conflict Analysis failed'));
  } finally {
    isAiAnalyzing.value = false;
  }
}

watch(
  () => [diffStore.selectedConflictFile, repoStore.activeRepoPath],
  () => void loadConflict(),
  { immediate: true }
);
</script>

<template>
  <div class="h-full flex flex-col bg-card overflow-hidden text-xs">
    <div class="dbx-pane-header min-h-10 px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/30 flex items-center justify-between gap-3">
      <div class="flex items-center space-x-2 min-w-0">
        <FileWarning class="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <div class="min-w-0">
          <div class="font-bold text-foreground truncate">{{ conflict?.file_path || diffStore.selectedConflictFile }}</div>
          <div class="text-[10px] text-muted-foreground">
            {{ conflict?.is_binary ? t('Binary conflict') : t('{count} unresolved blocks', { count: unresolvedCount }) }}
          </div>
        </div>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <template v-if="conflict && !conflict.is_binary && conflictIndexes.length > 0">
          <button
            @click="handleAiAnalyze"
            :disabled="isAiAnalyzing || isLoading"
            class="px-2 py-1 rounded border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/10 flex items-center gap-1 cursor-pointer disabled:opacity-50"
            :title="t('Get AI merge conflict resolution suggestion')"
          >
            <LoaderCircle v-if="isAiAnalyzing" class="w-3.5 h-3.5 animate-spin" />
            <Sparkles v-else class="w-3.5 h-3.5" />
            <span>{{ t('AI Suggestion') }}</span>
          </button>
          <button @click="chooseAll('ours')" class="px-2 py-1 rounded border border-blue-500/30 text-blue-700 dark:text-blue-300 hover:bg-blue-500/10">
            {{ t('Use All Ours') }}
          </button>
          <button @click="chooseAll('theirs')" class="px-2 py-1 rounded border border-purple-500/30 text-purple-700 dark:text-purple-300 hover:bg-purple-500/10">
            {{ t('Use All Theirs') }}
          </button>
          <button
            @click="saveTextResolution"
            :disabled="isSaving || unresolvedCount > 0"
            class="px-2.5 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <LoaderCircle v-if="isSaving" class="w-3.5 h-3.5 animate-spin" />
            <Check v-else class="w-3.5 h-3.5" />
            {{ t('Save and Mark Resolved') }}
          </button>
        </template>
        <button @click="diffStore.clearConflictSelection()" class="p-1 rounded hover:bg-secondary text-muted-foreground" :title="t('Close')">
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>

    <div v-if="isLoading" class="flex-1 flex items-center justify-center text-muted-foreground gap-2">
      <LoaderCircle class="w-4 h-4 animate-spin" />
      {{ t('Loading conflict...') }}
    </div>

    <div v-else-if="errorMessage" class="m-3 p-3 rounded border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 flex items-start gap-2">
      <AlertTriangle class="w-4 h-4 shrink-0 mt-0.5" />
      <span>{{ errorMessage }}</span>
    </div>

    <div v-else-if="conflict?.is_binary" class="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
      <FileWarning class="w-10 h-10 text-amber-500" />
      <div>
        <div class="font-bold text-sm">{{ t('This binary file cannot be merged as text.') }}</div>
        <div class="text-muted-foreground mt-1">{{ t('Choose the complete local or incoming version.') }}</div>
      </div>
      <div class="flex gap-2">
        <button @click="finishResolution({ side: 'ours' })" :disabled="isSaving" class="px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-40">
          {{ t('Keep Ours') }}
        </button>
        <button @click="finishResolution({ side: 'theirs' })" :disabled="isSaving" class="px-3 py-1.5 rounded bg-purple-600 text-white disabled:opacity-40">
          {{ t('Keep Theirs') }}
        </button>
      </div>
    </div>

    <div v-else-if="conflict && conflictIndexes.length === 0" class="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
      <FileWarning class="w-10 h-10 text-amber-500" />
      <div>
        <div class="font-bold text-sm">{{ t('Choose the complete version for this file conflict.') }}</div>
        <div class="text-muted-foreground mt-1">{{ t('One side may delete the file.') }}</div>
      </div>
      <div class="flex gap-2">
        <button @click="finishResolution({ side: 'ours' })" :disabled="isSaving" class="px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-40">
          {{ t('Keep Ours') }}
        </button>
        <button @click="finishResolution({ side: 'theirs' })" :disabled="isSaving" class="px-3 py-1.5 rounded bg-purple-600 text-white disabled:opacity-40">
          {{ t('Keep Theirs') }}
        </button>
      </div>
    </div>

    <div v-else-if="conflict" class="flex-1 overflow-y-auto p-3 space-y-3 bg-background/40">
      <section
        v-for="index in conflictIndexes"
        :key="index"
        class="rounded-lg border overflow-hidden"
        :class="resolutions[index] === null ? 'border-amber-500/40' : 'border-emerald-500/40'"
      >
        <div class="h-8 px-3 bg-muted/60 border-b border-border flex items-center justify-between">
          <span class="font-bold">{{ t('Conflict block {index}', { index: conflictIndexes.indexOf(index) + 1 }) }}</span>
          <span :class="resolutions[index] === null ? 'text-amber-600 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-300'">
            {{ resolutions[index] === null ? t('Unresolved') : t('Resolved') }}
          </span>
        </div>

        <div class="grid grid-cols-3 divide-x divide-border border-b border-border">
          <div class="min-w-0">
            <div class="px-2 py-1 bg-blue-500/10 text-blue-700 dark:text-blue-300 font-semibold">{{ t('Ours (Current)') }}</div>
            <pre class="p-2 min-h-20 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px]">{{ getConflictSection(conflict.chunks[index])?.ours }}</pre>
          </div>
          <div class="min-w-0 bg-muted/20">
            <div class="px-2 py-1 bg-muted/60 text-muted-foreground font-semibold">{{ t('Base') }}</div>
            <pre class="p-2 min-h-20 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">{{ getConflictSection(conflict.chunks[index])?.base ?? t('No base content') }}</pre>
          </div>
          <div class="min-w-0">
            <div class="px-2 py-1 bg-purple-500/10 text-purple-700 dark:text-purple-300 font-semibold">{{ t('Theirs (Incoming)') }}</div>
            <pre class="p-2 min-h-20 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px]">{{ getConflictSection(conflict.chunks[index])?.theirs }}</pre>
          </div>
        </div>

        <div class="p-2 bg-card">
          <div class="flex items-center gap-1.5 mb-2">
            <button @click="choose(index, 'ours')" class="px-2 py-1 rounded bg-blue-500/10 text-blue-700 dark:text-blue-300 hover:bg-blue-500/20">{{ t('Accept Ours') }}</button>
            <button @click="choose(index, 'theirs')" class="px-2 py-1 rounded bg-purple-500/10 text-purple-700 dark:text-purple-300 hover:bg-purple-500/20">{{ t('Accept Theirs') }}</button>
            <button @click="choose(index, 'both')" class="px-2 py-1 rounded bg-secondary text-foreground hover:bg-muted">{{ t('Accept Both') }}</button>
          </div>
          <textarea
            :value="resolutions[index] ?? ''"
            @input="resolutions[index] = ($event.target as HTMLTextAreaElement).value"
            :placeholder="t('Choose a side or enter the resolved content')"
            class="w-full min-h-24 p-2 rounded border border-border bg-background font-mono text-[11px] resize-y focus:outline-none focus:ring-1 focus:ring-emerald-500"
          ></textarea>
        </div>
      </section>
    </div>
  </div>
</template>
