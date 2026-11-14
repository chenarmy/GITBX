<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useAiStore } from '@/stores/ai';
import { useRepoStore } from '@/stores/repo';
import { useGitApi } from '@/composables/useGitApi';
import { useNotificationStore } from '@/stores/notification';
import { useSettingsStore } from '@/stores/settings';
import { useI18n } from '@/i18n';
import ArcoModal from '@/components/ui/ArcoModal.vue';
import {
  Sparkles,
  Send,
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
    notification.error(t('AI Generation Failed'), err?.message || String(err));
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
  navigator.clipboard.writeText(getFullMessage())
    .then(() => {
      isCopied.value = true;
      setTimeout(() => {
        isCopied.value = false;
      }, 2000);
    })
    .catch((err) => {
      console.warn('Failed to copy message to clipboard:', err);
      notification.error(t('Copy Failed'), t('Could not copy commit message to clipboard.'));
    });
}
</script>

<template>
  <ArcoModal
    v-if="aiStore.isAiModalOpen"
    :title="t('GITBX AI Assistant')"
    max-width-class="max-w-lg"
    height-class="max-h-[85vh]"
    @close="aiStore.closeAiModal()"
  >
    <template #icon>
      <Sparkles class="w-4 h-4" aria-hidden="true" />
    </template>
    <template #header-extra>
      <span class="arco-tag bg-primary/10 text-primary border-primary/25 font-mono">
        {{ aiStore.llmConfig.provider }} / {{ aiStore.llmConfig.model }}
      </span>
    </template>

    <!-- 1. Secret Scanning Alert -->
    <div
      v-if="aiStore.detectedSecrets.length > 0"
      class="p-3.5 bg-destructive/10 border border-destructive/30 rounded-[6px] text-destructive space-y-2"
    >
      <div class="flex items-center gap-2 font-semibold">
        <ShieldAlert class="w-4 h-4 shrink-0" />
        <span>{{ t('Security Warning: Secrets Detected!') }}</span>
      </div>
      <p class="text-[11px] text-muted-foreground">
        {{ t('GITBX detected sensitive tokens in your selected diff. Please review and remove them before committing.') }}
      </p>
      <div class="space-y-1 pt-1">
        <div
          v-for="(sec, index) in aiStore.detectedSecrets"
          :key="index"
          class="flex items-center justify-between bg-card/80 px-2.5 py-1 rounded-[4px] text-[11px] border border-destructive/20"
        >
          <span class="font-medium text-foreground">{{ sec.rule_name }}</span>
          <span class="font-mono text-muted-foreground">Line {{ sec.line_number }}</span>
        </div>
      </div>
    </div>

    <!-- 2. AI Generated Commit Preview -->
    <div class="space-y-2.5">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="font-semibold text-foreground">{{ t('Generated Conventional Commit') }}</span>
          <span class="text-[10px] text-muted-foreground font-mono">({{ aiStore.llmConfig.model }})</span>
        </div>
        <button
          @click="generate"
          :disabled="aiStore.isGenerating"
          class="arco-btn arco-btn-text arco-btn-sm text-primary cursor-pointer"
        >
          <RefreshCw class="w-3 h-3" :class="{ 'animate-spin': aiStore.isGenerating }" />
          <span>{{ t('Regenerate') }}</span>
        </button>
      </div>

      <div class="arco-card p-3.5 space-y-3 bg-background/50">
        <div>
          <label class="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold block mb-1">{{ t('Summary') }}</label>
          <input
            v-model="summaryDraft"
            type="text"
            class="arco-input font-mono"
          />
        </div>
        <div>
          <label class="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold block mb-1">{{ t('Body (Optional)') }}</label>
          <textarea
            v-model="bodyDraft"
            rows="3"
            class="arco-textarea font-mono resize-y"
          ></textarea>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center justify-end gap-2 pt-1">
        <button
          @click="copyMessage"
          :disabled="!hasGeneratedMessage"
          class="arco-btn arco-btn-outline cursor-pointer"
        >
          <component :is="isCopied ? Check : Copy" class="w-3.5 h-3.5 text-primary" />
          <span>{{ isCopied ? t('Copied') : t('Copy Message') }}</span>
        </button>
        <button
          @click="applyToCommitBox"
          :disabled="!hasGeneratedMessage"
          class="arco-btn arco-btn-primary cursor-pointer"
        >
          <Check class="w-3.5 h-3.5" />
          <span>{{ t('Apply to Commit Box') }}</span>
        </button>
      </div>
    </div>

    <!-- 3. Natural Language Git Assistant -->
    <div class="space-y-2 border-t border-border pt-3.5">
      <span class="font-semibold text-foreground block">{{ t('Natural Language Git Assistant') }}</span>
      <div class="flex items-center gap-2">
        <input
          v-model="naturalCommand"
          type="text"
          :placeholder="naturalCommandPlaceholder"
          @keydown.enter="handleNaturalCommand"
          class="arco-input flex-1"
        />
        <button
          @click="handleNaturalCommand"
          :disabled="aiStore.isGenerating || !naturalCommand.trim()"
          class="arco-btn arco-btn-primary h-8 px-3.5 cursor-pointer shrink-0"
        >
          <Send class="w-3.5 h-3.5" />
          <span>{{ t('Run') }}</span>
        </button>
      </div>
    </div>
  </ArcoModal>
</template>
