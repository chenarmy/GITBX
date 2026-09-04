<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, FileWarning, LoaderCircle, Sparkles, X } from 'lucide-vue-next';
import { formatGitError, useGitApi } from '@/composables/useGitApi';
import { useDiffStore } from '@/stores/diff';
import { useNotificationStore } from '@/stores/notification';
import { useRepoStore } from '@/stores/repo';
import { useAiStore } from '@/stores/ai';
import { useSettingsStore } from '@/stores/settings';
import type { ConflictChunk, ConflictFileContent } from '@/types/diff';
import { useI18n } from '@/i18n';

const gitApi = useGitApi();
const diffStore = useDiffStore();
const repoStore = useRepoStore();
const aiStore = useAiStore();
const settingsStore = useSettingsStore();
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

function applySide(index: number, side: 'ours' | 'theirs') {
  const section = conflict.value ? getConflictSection(conflict.value.chunks[index]) : null;
  if (!section) return;
  const source = section[side];
  const current = resolutions.value[index];
  if (current === null || current === '') {
    resolutions.value[index] = source;
    return;
  }
  if (!source || current.includes(source)) return;
  resolutions.value[index] = side === 'ours'
    ? combineBoth(source, current)
    : combineBoth(current, source);
}

function removeSide(index: number, side: 'ours' | 'theirs') {
  const section = conflict.value ? getConflictSection(conflict.value.chunks[index]) : null;
  if (!section) return;
  const source = section[side];
  const current = resolutions.value[index] ?? '';
  if (!source || !current.includes(source)) {
    // Clicking × is also an explicit decision that this side contributes no
    // content, so an empty result is considered resolved.
    if (resolutions.value[index] === null) resolutions.value[index] = '';
    return;
  }
  resolutions.value[index] = current
    .replace(source, '')
    .replace(/^\r?\n/, '')
    .replace(/\r?\n$/, '');
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
      aiStore.llmConfig,
      settingsStore.language,
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

        <div class="grid grid-cols-[minmax(0,1fr)_36px_minmax(0,1fr)_36px_minmax(0,1fr)] border-b border-border min-h-40">
          <div class="min-w-0 flex flex-col">
            <div class="px-2 py-1.5 bg-blue-500/10 text-blue-700 dark:text-blue-300 font-semibold border-b border-border">{{ t('Ours (Current)') }}</div>
            <pre class="flex-1 p-2 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] bg-blue-500/[0.03]">{{ getConflictSection(conflict.chunks[index])?.ours }}</pre>
          </div>

          <div class="flex flex-col items-center justify-center gap-2 border-x border-border bg-muted/40">
            <button
              @click="applySide(index, 'ours')"
              class="w-7 h-7 flex items-center justify-center rounded border border-blue-500/40 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20"
              :title="t('Apply local content')"
            >
              <ArrowRight class="w-4 h-4" />
            </button>
            <button
              @click="removeSide(index, 'ours')"
              class="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:bg-rose-500/15 hover:text-rose-500"
              :title="t('Remove local content')"
            >
              <X class="w-4 h-4" />
            </button>
          </div>

          <div class="min-w-0 flex flex-col bg-emerald-500/[0.03]">
            <div class="px-2 py-1.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold border-b border-border">{{ t('Merge Result') }}</div>
            <textarea
              :value="resolutions[index] ?? ''"
              @input="resolutions[index] = ($event.target as HTMLTextAreaElement).value"
              :placeholder="t('Choose a side or enter the resolved content')"
              spellcheck="false"
              class="flex-1 min-h-32 w-full p-2 bg-transparent font-mono text-[11px] resize-none focus:outline-none focus:ring-1 focus:ring-inset focus:ring-emerald-500"
            ></textarea>
          </div>

          <div class="flex flex-col items-center justify-center gap-2 border-x border-border bg-muted/40">
            <button
              @click="applySide(index, 'theirs')"
              class="w-7 h-7 flex items-center justify-center rounded border border-purple-500/40 bg-purple-500/10 text-purple-600 hover:bg-purple-500/20"
              :title="t('Apply incoming content')"
            >
              <ArrowLeft class="w-4 h-4" />
            </button>
            <button
              @click="removeSide(index, 'theirs')"
              class="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:bg-rose-500/15 hover:text-rose-500"
              :title="t('Remove incoming content')"
            >
              <X class="w-4 h-4" />
            </button>
          </div>

          <div class="min-w-0 flex flex-col">
            <div class="px-2 py-1.5 bg-purple-500/10 text-purple-700 dark:text-purple-300 font-semibold border-b border-border">{{ t('Theirs (Incoming)') }}</div>
            <pre class="flex-1 p-2 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] bg-purple-500/[0.03]">{{ getConflictSection(conflict.chunks[index])?.theirs }}</pre>
          </div>
        </div>

        <details v-if="getConflictSection(conflict.chunks[index])?.base" class="px-3 py-1.5 bg-muted/30 text-[10px] text-muted-foreground">
          <summary class="cursor-pointer font-semibold">{{ t('Base') }}</summary>
          <pre class="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono">{{ getConflictSection(conflict.chunks[index])?.base }}</pre>
        </details>
      </section>
    </div>
  </div>
</template>
