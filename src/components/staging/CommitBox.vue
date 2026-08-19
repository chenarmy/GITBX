<script setup lang="ts">
import { ref } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { useSettingsStore } from '@/stores/settings';
import { useAiStore } from '@/stores/ai';
import { Sparkles, Send } from 'lucide-vue-next';

const repoStore = useRepoStore();
const settingsStore = useSettingsStore();
const aiStore = useAiStore();

const commitMessage = ref('');
const isSubmitting = ref(false);

const CONVENTIONAL_TAGS = ['feat', 'fix', 'refactor', 'docs', 'chore', 'perf'];

function insertPrefix(tag: string) {
  commitMessage.value = `${tag}: ${commitMessage.value.replace(/^(feat|fix|refactor|docs|chore|perf):\s*/, '')}`;
}

async function handleCommit() {
  if (!commitMessage.value.trim()) return;
  isSubmitting.value = true;
  try {
    await repoStore.commit(
      commitMessage.value,
      settingsStore.authorName,
      settingsStore.authorEmail
    );
    commitMessage.value = '';
  } catch (err) {
    console.error('Commit failed:', err);
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div class="h-44 bg-card border-t border-border flex flex-col p-2 text-xs select-none">
    <!-- Conventional Commit shortcuts & AI Trigger -->
    <div class="flex items-center justify-between mb-1.5">
      <div class="flex items-center space-x-1">
        <button
          v-for="tag in CONVENTIONAL_TAGS"
          :key="tag"
          @click="insertPrefix(tag)"
          class="px-1.5 py-0.5 rounded bg-muted/60 hover:bg-accent text-muted-foreground hover:text-foreground font-mono text-[10px] transition"
        >
          {{ tag }}
        </button>
      </div>

      <button
        @click="aiStore.openAiModal()"
        class="flex items-center space-x-1 px-2 py-0.5 rounded bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 transition text-[11px]"
      >
        <Sparkles class="w-3 h-3 text-indigo-400" />
        <span>AI Generate</span>
      </button>
    </div>

    <!-- Commit message input -->
    <textarea
      v-model="commitMessage"
      placeholder="Commit summary (e.g. feat: add Canvas graph view)..."
      class="flex-1 w-full bg-background/60 border border-border rounded p-2 text-foreground font-sans text-xs focus:outline-none focus:ring-1 focus:ring-primary resize-none placeholder:text-muted-foreground/60"
    ></textarea>

    <!-- Bottom Actions: Author info & Commit Button -->
    <div class="flex items-center justify-between mt-2 pt-1 border-t border-border/40">
      <div class="text-[11px] text-muted-foreground truncate">
        Committer: <span class="font-medium text-foreground">{{ settingsStore.authorName }}</span> ({{ settingsStore.authorEmail }})
      </div>

      <button
        @click="handleCommit"
        :disabled="!commitMessage.trim() || isSubmitting || repoStore.statusSummary.staged_files.length === 0"
        class="flex items-center space-x-1.5 px-3 py-1 rounded bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
      >
        <Send class="w-3.5 h-3.5" />
        <span>Commit to {{ repoStore.repoInfo?.head_branch || 'main' }}</span>
      </button>
    </div>
  </div>
</template>
