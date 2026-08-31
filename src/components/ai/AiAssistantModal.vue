<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useAiStore } from '@/stores/ai';
import { useRepoStore } from '@/stores/repo';
import { useGitApi } from '@/composables/useGitApi';
import { useNotificationStore } from '@/stores/notification';
import { useSettingsStore } from '@/stores/settings';
import { useI18n } from '@/i18n';
import {
  Sparkles,
  Send,
  X,
  Copy,
  Check,
  ShieldAlert,
  RefreshCw,
} from 'lucide-vue-next';

const aiStore = useAiStore();
const repoStore = useRepoStore();
const gitApi = useGitApi();
const notification = useNotificationStore();
const settingsStore = useSettingsStore();
const { t } = useI18n();

const naturalCommand = ref('');
const isCopied = ref(false);
const summaryDraft = ref('');
const bodyDraft = ref('');

const hasGeneratedMessage = computed(() => Boolean(aiStore.generatedMessage?.summary?.trim()));
const naturalCommandPlaceholder = computed(() => t("e.g. 'Undo last commit without losing changes' or 'Create and switch to feat/mcp-tools'..."));

watch(() => aiStore.generatedMessage, (val) => {
  if (val) {
    summaryDraft.value = val.summary;
    bodyDraft.value = val.body || '';
  }
}, { immediate: true });

async function generate() {
  aiStore.isGenerating = true;
  try {
    const selectedPaths = repoStore.selectedChangePaths;
    if (selectedPaths.length === 0) {
      aiStore.generatedMessage = null;
      notification.warning(t('No changes selected'), t('Select at least one file before generating a commit message.'));
      return;
    }

    const stagedPathSet = new Set(repoStore.statusSummary.staged_files.map((file) => file.path));
    const unstagedPathSet = new Set([
      ...repoStore.statusSummary.unstaged_files.map((file) => file.path),
      ...repoStore.statusSummary.untracked_files.map((file) => file.path),
    ]);

    const diffPromises: Promise<{ path: string; diff: any }>[] = [];
    for (const path of selectedPaths) {
      const isStaged = stagedPathSet.has(path);
      const isUnstaged = unstagedPathSet.has(path);

      if (isStaged) {
        diffPromises.push(
          gitApi.getFileDiff(repoStore.activeRepoPath, path, true)
            .then((diff) => ({ path, diff }))
            .catch(() => ({ path, diff: null })),
        );
      }
      if (isUnstaged || !isStaged) {
        diffPromises.push(
          gitApi.getFileDiff(repoStore.activeRepoPath, path, false)
            .then((diff) => ({ path, diff }))
            .catch(() => ({ path, diff: null })),
        );
      }
    }

    const results = await Promise.all(diffPromises);
    const diffText = results
      .map(({ path, diff }) => (diff ? formatDiffForAi(diff, path) : ''))
      .filter(Boolean)
      .join('\n');

    if (!diffText.trim()) {
      aiStore.generatedMessage = null;
      notification.warning(t('Empty diff'), t('The selected files have no readable changes to analyze.'));
      return;
    }

    aiStore.detectedSecrets = await gitApi.scanSecrets(diffText);
    if (aiStore.detectedSecrets.length > 0) return;
    aiStore.generatedMessage = await gitApi.generateCommitMessage(
      diffText,
      aiStore.llmConfig,
      settingsStore.language,
    );
  } catch (err: any) {
    aiStore.generatedMessage = null;
    throw err;
  } finally {
    aiStore.isGenerating = false;
  }
}

function formatDiffForAi(diff: any, filePath: string): string {
  if (typeof diff?.raw_diff === 'string' && diff.raw_diff.trim()) return diff.raw_diff;
  if (diff?.is_binary) return `Binary file changed: ${filePath}`;
  if (!Array.isArray(diff?.hunks)) return '';

  const hunks = diff.hunks
    .map((hunk: any) => {
      const lines = Array.isArray(hunk.lines)
        ? hunk.lines.map((line: any) => {
            const prefix = line.line_type === 'Addition' ? '+' : line.line_type === 'Deletion' ? '-' : ' ';
            return `${prefix}${line.content ?? ''}`;
          }).join('\n')
        : '';
      return `${hunk.header ?? ''}\n${lines}`.trim();
    })
    .filter(Boolean)
    .join('\n');

  return hunks ? `diff --git a/${filePath} b/${filePath}\n${hunks}` : '';
}

watch(() => aiStore.isAiModalOpen, (open) => {
  if (open && !aiStore.generatedMessage) generate().catch(() => undefined);
});

function getFullMessage(): string {
  const summary = summaryDraft.value.trim();
  const body = bodyDraft.value.trim();
  return body.length > 0 ? `${summary}\n\n${body}` : summary;
}

function applyToCommitBox() {
  if (!hasGeneratedMessage.value) {
    notification.warning(t('Nothing to apply'), t('Generate a commit message from changes first.'));
    return;
  }
  aiStore.applyCommitMessage(getFullMessage());
  aiStore.closeAiModal();
}

async function handleNaturalCommand() {
  const query = naturalCommand.value.trim();
  if (!query) return;
  aiStore.isGenerating = true;
  try {
    const prompt = `User instruction: ${query}\nRepo: ${repoStore.activeRepoPath}\nBranch: ${repoStore.repoInfo?.head_branch || 'main'}`;
    const res = await gitApi.generateCommitMessage(prompt, aiStore.llmConfig, settingsStore.language);
    aiStore.generatedMessage = res;
    naturalCommand.value = '';
    notification.success(t('AI Response'), res.summary);
  } catch (error: any) {
    notification.error(t('AI Assistant Error'), error?.message || String(error));
  } finally {
    aiStore.isGenerating = false;
  }
}

function copyMessage() {
  if (!hasGeneratedMessage.value) return;
  navigator.clipboard.writeText(getFullMessage());
  isCopied.value = true;
  setTimeout(() => {
    isCopied.value = false;
  }, 2000);
}
</script>

<template>
  <div
    v-if="aiStore.isAiModalOpen"
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
  >
    <div
      class="w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs animate-in fade-in zoom-in-95 duration-150"
    >
      <!-- Header -->
      <div class="h-11 bg-muted/50 px-4 flex items-center justify-between border-b border-border select-none">
        <div class="flex items-center space-x-2">
          <Sparkles class="w-4 h-4 text-indigo-400 animate-pulse" />
          <span class="font-bold text-sm text-foreground">{{ t('GITBX AI Assistant') }}</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            {{ aiStore.llmConfig.provider }} / {{ aiStore.llmConfig.model }}
          </span>
        </div>
        <button
          @click="aiStore.closeAiModal()"
          class="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition cursor-pointer"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Body Content -->
      <div class="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
        <!-- 1. Secret Scanning Alert -->
        <div
          v-if="aiStore.detectedSecrets.length > 0"
          class="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300 space-y-2"
        >
          <div class="flex items-center space-x-2 font-bold text-rose-400">
            <ShieldAlert class="w-4 h-4 shrink-0" />
            <span>{{ t('Security Warning: Secrets Detected!') }}</span>
          </div>
          <p class="text-[11px] text-muted-foreground">
            {{ t('GITBX detected sensitive tokens in your selected diff. Please review and remove them before committing.') }}
          </p>
          <div class="space-y-1 mt-2">
            <div
              v-for="(sec, index) in aiStore.detectedSecrets"
              :key="index"
              class="flex items-center justify-between bg-card/60 px-2 py-1 rounded text-[11px] border border-rose-500/20"
            >
              <span class="font-medium text-rose-200">{{ sec.rule_name }}</span>
              <span class="font-mono text-muted-foreground">Line {{ sec.line_number }}</span>
            </div>
          </div>
        </div>

        <!-- 2. AI Generated Commit Preview -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <span class="font-semibold text-foreground">{{ t('Generated Conventional Commit') }}</span>
              <span class="text-[10px] text-muted-foreground">({{ aiStore.llmConfig.model }})</span>
            </div>
            <button
              @click="generate"
              :disabled="aiStore.isGenerating"
              class="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center space-x-1 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw class="w-3 h-3" :class="{ 'animate-spin': aiStore.isGenerating }" />
              <span>{{ t('Regenerate') }}</span>
            </button>
          </div>

          <div class="bg-background border border-border rounded-lg p-3 space-y-2">
            <div>
              <label class="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{{ t('Summary') }}</label>
              <input
                v-model="summaryDraft"
                type="text"
                class="w-full bg-card border border-border rounded px-2.5 py-1.5 mt-0.5 font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label class="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{{ t('Body (Optional)') }}</label>
              <textarea
                v-model="bodyDraft"
                rows="3"
                class="w-full bg-card border border-border rounded px-2.5 py-1.5 mt-0.5 font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y"
              ></textarea>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center justify-end space-x-2 pt-1">
            <button
              @click="copyMessage"
              :disabled="!hasGeneratedMessage"
              class="flex items-center space-x-1 px-3 py-1.5 rounded border border-border hover:bg-accent text-foreground transition disabled:opacity-40 cursor-pointer"
            >
              <component :is="isCopied ? Check : Copy" class="w-3.5 h-3.5 text-blue-400" />
              <span>{{ isCopied ? t('Copied') : t('Copy Message') }}</span>
            </button>
            <button
              @click="applyToCommitBox"
              :disabled="!hasGeneratedMessage"
              class="flex items-center space-x-1 px-3 py-1.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Check class="w-3.5 h-3.5" />
              <span>{{ t('Apply to Commit Box') }}</span>
            </button>
          </div>
        </div>

        <!-- 3. Natural Language Git Assistant -->
        <div class="space-y-2 border-t border-border pt-3">
          <span class="font-semibold text-foreground">{{ t('Natural Language Git Assistant') }}</span>
          <div class="flex items-center space-x-2">
            <input
              v-model="naturalCommand"
              type="text"
              :placeholder="naturalCommandPlaceholder"
              @keydown.enter="handleNaturalCommand"
              class="flex-1 bg-background border border-border rounded px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary text-xs"
            />
            <button
              @click="handleNaturalCommand"
              :disabled="aiStore.isGenerating || !naturalCommand.trim()"
              class="px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition flex items-center space-x-1 disabled:opacity-50 cursor-pointer"
            >
              <Send class="w-3.5 h-3.5" />
              <span>{{ t('Run') }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
