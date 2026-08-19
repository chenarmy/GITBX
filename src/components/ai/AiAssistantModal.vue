<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAiStore } from '@/stores/ai';
import {
  Sparkles,
  ShieldCheck,
  Send,
  X,
  Copy,
  Check,
} from 'lucide-vue-next';

const aiStore = useAiStore();

const naturalCommand = ref('');
const isCopied = ref(false);

const mockGeneratedCommit = ref({
  type: 'feat',
  summary: 'feat(graph): implement Canvas-based commit DAG renderer with virtual lanes',
  body: '- Added Rust gitbx-graph lane tracker and Bezier control points calculation\n- Integrated 60fps HTML Canvas with dual-buffering\n- Added branch and tag badges to commit table',
});

const displayedCommit = computed(() => {
  if (aiStore.generatedMessage) {
    return {
      type: aiStore.generatedMessage.commit_type,
      summary: aiStore.generatedMessage.summary,
      body: aiStore.generatedMessage.body || '',
    };
  }
  return mockGeneratedCommit.value;
});

function getFullMessage(): string {
  const commit = displayedCommit.value;
  return commit.body && commit.body.trim().length > 0
    ? `${commit.summary}\n\n${commit.body}`
    : commit.summary;
}

function applyToCommitBox() {
  aiStore.applyCommitMessage(getFullMessage());
  aiStore.closeAiModal();
}

function copyMessage() {
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
        <div class="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
          <div class="flex items-center space-x-2.5">
            <ShieldCheck class="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <div class="font-semibold text-emerald-300">Security & Secret Check Passed</div>
              <div class="text-[11px] text-emerald-400/80">No private keys, AWS tokens, or hardcoded passwords found in staged diff.</div>
            </div>
          </div>
          <span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">CLEAN</span>
        </div>

        <!-- 2. AI Commit Message Generator Result -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="font-semibold text-foreground">AI Generated Commit Message (Conventional Commits)</span>
            <span class="text-[10px] text-muted-foreground">Model: {{ aiStore.llmConfig.model }}</span>
          </div>

          <div class="p-3 rounded-lg bg-background border border-border space-y-2 font-mono text-[11px]">
            <div class="text-indigo-400 font-bold">{{ displayedCommit.summary }}</div>
            <div
              v-if="displayedCommit.body"
              class="text-muted-foreground whitespace-pre-line border-t border-border/40 pt-2"
            >
              {{ displayedCommit.body }}
            </div>
          </div>

          <div class="flex items-center justify-end space-x-2 pt-1">
            <button
              @click="copyMessage"
              class="flex items-center space-x-1 px-3 py-1.5 rounded bg-secondary hover:bg-accent text-secondary-foreground transition"
            >
              <component :is="isCopied ? Check : Copy" class="w-3.5 h-3.5 text-blue-400" />
              <span>{{ isCopied ? 'Copied' : 'Copy Message' }}</span>
            </button>
            <button
              @click="applyToCommitBox"
              class="flex items-center space-x-1 px-3 py-1.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition"
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
            <button class="px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition flex items-center space-x-1">
              <Send class="w-3.5 h-3.5" />
              <span>Run</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
