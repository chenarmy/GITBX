<script setup lang="ts">
 import { ref, computed, watch } from 'vue';
import { useAiStore } from '@/stores/ai';
import { useRepoStore } from '@/stores/repo';
import { useGitApi } from '@/composables/useGitApi';
import { useNotificationStore } from '@/stores/notification';
import {
  Sparkles,
  ShieldCheck,
  Send,
  X,
  Copy,
  Check,
} from 'lucide-vue-next';

const aiStore = useAiStore();
const repoStore = useRepoStore();
const gitApi = useGitApi();
const notification = useNotificationStore();

const naturalCommand = ref('');
const isCopied = ref(false);

const hasGeneratedMessage = computed(() => Boolean(aiStore.generatedMessage?.summary?.trim()));

const displayedCommit = computed(() => {
  if (aiStore.generatedMessage) {
    return {
      type: aiStore.generatedMessage.commit_type,
      summary: aiStore.generatedMessage.summary,
      body: aiStore.generatedMessage.body || '',
    };
  }
  return { type: '', summary: '', body: '' };
});

async function generate() {
  aiStore.isGenerating = true;
  try {
    const files = repoStore.statusSummary.staged_files;
    if (files.length === 0) {
      aiStore.generatedMessage = null;
      notification.warning('No staged changes', 'Stage at least one file before generating a commit message.');
      return;
    }

    const diffs = await Promise.all(files.map((file) => gitApi.getFileDiff(repoStore.activeRepoPath, file.path, true)));
    const diffText = diffs
      .map((diff, index) => formatDiffForAi(diff, files[index].path))
      .filter(Boolean)
      .join('\n');
    if (!diffText.trim()) {
      aiStore.generatedMessage = null;
      notification.warning('Empty staged diff', 'The staged files have no readable changes to analyze.');
      return;
    }
    aiStore.detectedSecrets = await gitApi.scanSecrets(diffText);
    if (aiStore.detectedSecrets.length > 0) return;
    aiStore.generatedMessage = await gitApi.generateCommitMessage(diffText, aiStore.llmConfig);
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
  const commit = displayedCommit.value;
  return commit.body && commit.body.trim().length > 0
    ? `${commit.summary}\n\n${commit.body}`
    : commit.summary;
}

function applyToCommitBox() {
  if (!hasGeneratedMessage.value) {
    notification.warning('Nothing to apply', 'Generate a commit message from staged changes first.');
    return;
  }
  aiStore.applyCommitMessage(getFullMessage());
  aiStore.closeAiModal();
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
      class="w-full max-w-2xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs"
    >
      <!-- Modal Header -->
      <div class="h-11 bg-muted/50 px-4 flex items-center justify-between border-b border-border select-none">
        <div class="flex items-center space-x-2">
          <div class="p-1 rounded bg-indigo-500/20 text-indigo-400">
            <Sparkles class="w-4 h-4" />
          </div>
          <span class="font-bold text-sm text-foreground">GITBX AI Copilot</span>
        </div>
        <button
          @click="aiStore.closeAiModal()"
          class="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Modal Body -->
      <div class="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
        <!-- 1. Pre-commit Secret Scanner Status -->
        <div
          class="p-3 rounded-lg border flex items-center justify-between"
          :class="hasGeneratedMessage ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-secondary border-border'"
        >
          <div class="flex items-center space-x-2.5">
            <ShieldCheck class="w-5 h-5 shrink-0" :class="hasGeneratedMessage ? 'text-emerald-400' : 'text-muted-foreground'" />
            <div>
              <div class="font-semibold" :class="hasGeneratedMessage ? 'text-emerald-300' : 'text-muted-foreground'">
                {{ aiStore.detectedSecrets.length ? 'Potential secrets detected' : hasGeneratedMessage ? 'Security & Secret Check Passed' : 'Waiting for staged changes' }}
              </div>
              <div class="text-[11px]" :class="hasGeneratedMessage ? 'text-emerald-400/80' : 'text-muted-foreground'">
                {{ aiStore.detectedSecrets.length ? 'Review detected secrets before committing.' : hasGeneratedMessage ? 'The staged diff has been checked for common credential patterns.' : 'Stage at least one file to run the security scan.' }}
              </div>
            </div>
          </div>
          <span
            class="px-2 py-0.5 rounded text-[10px] font-bold"
            :class="hasGeneratedMessage ? 'bg-emerald-500/20 text-emerald-300' : 'bg-secondary text-muted-foreground'"
          >{{ hasGeneratedMessage ? 'CLEAN' : 'WAITING' }}</span>
        </div>

        <!-- 2. AI Commit Message Generator Result -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="font-semibold text-foreground">AI Generated Commit Message (Conventional Commits)</span>
            <span class="text-[10px] text-muted-foreground">Model: {{ aiStore.llmConfig.model }}</span>
          </div>

          <div class="p-3 rounded-lg bg-background border border-border space-y-2 font-mono text-[11px]">
            <div v-if="aiStore.isGenerating" class="text-muted-foreground">Generating from staged changes…</div>
            <div v-else-if="displayedCommit.summary" class="text-indigo-400 font-bold">{{ displayedCommit.summary }}</div>
            <div v-else class="text-muted-foreground">Stage at least one file to generate a real commit message.</div>
            <div v-if="displayedCommit.body" class="text-muted-foreground whitespace-pre-line border-t border-border/40 pt-2">{{ displayedCommit.body }}</div>
          </div>

          <div class="flex items-center justify-end space-x-2 pt-1">
            <button
              @click="copyMessage"
              :disabled="!hasGeneratedMessage"
              class="flex items-center space-x-1 px-3 py-1.5 rounded bg-secondary hover:bg-accent text-secondary-foreground transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <component :is="isCopied ? Check : Copy" class="w-3.5 h-3.5 text-blue-400" />
              <span>{{ isCopied ? 'Copied' : 'Copy Message' }}</span>
            </button>
            <button
              @click="applyToCommitBox"
              :disabled="!hasGeneratedMessage"
              class="flex items-center space-x-1 px-3 py-1.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Check class="w-3.5 h-3.5" />
              <span>Apply to Commit Box</span>
            </button>
          </div>
        </div>

        <!-- 3. Natural Language Git Assistant -->
        <div class="space-y-2 border-t border-border pt-3">
          <span class="font-semibold text-foreground">Natural Language Git Assistant</span>
          <div class="flex items-center space-x-2">
            <input
              v-model="naturalCommand"
              type="text"
              placeholder="e.g. 'Undo last commit without losing changes' or 'Create and switch to feat/mcp-tools'..."
              class="flex-1 bg-background border border-border rounded px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary text-xs"
            />
            <button @click="generate" :disabled="aiStore.isGenerating" class="px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition flex items-center space-x-1 disabled:opacity-50">
              <Send class="w-3.5 h-3.5" />
              <span>Run</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
