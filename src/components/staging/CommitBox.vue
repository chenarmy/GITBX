<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { useSettingsStore } from '@/stores/settings';
import { useAiStore } from '@/stores/ai';
import { useNotificationStore } from '@/stores/notification';
import { Sparkles, Send } from 'lucide-vue-next';

const repoStore = useRepoStore();
const settingsStore = useSettingsStore();
const aiStore = useAiStore();
const notification = useNotificationStore();

const commitMessage = ref('');
const isSubmitting = ref(false);

// AI Copilot writes the generated message into the shared draft channel.
// Keep the textarea local for normal editing, but consume that draft here.
watch(
  () => aiStore.draftCommitMessage,
  (draft) => {
    if (!draft.trim()) return;
    commitMessage.value = draft;
    aiStore.draftCommitMessage = '';
  }
);

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
    notification.success('Commit Created', commitMessage.value);
    commitMessage.value = '';
  } catch (err: any) {
    notification.error('Commit Failed', err?.message);
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div class="dbx-commit-box h-44 bg-card border-t border-border flex flex-col p-2.5 text-xs select-none shrink-0">
    <!-- Conventional Commit shortcuts & AI Trigger -->
    <div class="flex items-center justify-between mb-1.5 gap-1">
      <div class="flex items-center flex-wrap gap-1 overflow-hidden">
        <button
          v-for="tag in CONVENTIONAL_TAGS"
          :key="tag"
          @click="insertPrefix(tag)"
          class="px-1.5 py-0.5 rounded bg-secondary hover:bg-muted border border-border text-foreground font-mono text-[10px] transition active:scale-95 shadow-2xs shrink-0"
        >
          {{ tag }}
        </button>
      </div>

      <button
        @click="aiStore.openAiModal()"
        class="flex items-center space-x-1 px-2 py-0.5 rounded-sm bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 transition text-[10px] font-bold active:scale-95 shrink-0 whitespace-nowrap"
      >
        <Sparkles class="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
        <span>AI Msg</span>
      </button>
    </div>

    <!-- Commit message input -->
    <textarea
      v-model="commitMessage"
      placeholder="Commit summary (e.g. feat: add Canvas graph view)..."
      class="flex-1 w-full bg-background border border-border rounded-sm p-2 text-foreground font-sans text-xs focus:outline-none focus:ring-1 focus:ring-primary resize-none placeholder:text-muted-foreground min-h-[60px]"
    ></textarea>

    <!-- Bottom Actions: Author info & Commit Button -->
    <div class="flex items-center justify-between mt-2 pt-1 border-t border-border gap-2">
      <div class="text-[11px] text-muted-foreground truncate flex-1">
        Committer: <span class="font-bold text-foreground">{{ settingsStore.authorName }}</span>
      </div>

      <button
        @click="handleCommit"
        :disabled="!commitMessage.trim() || isSubmitting || repoStore.statusSummary.staged_files.length === 0"
        class="flex items-center space-x-1.5 px-3 py-1 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shrink-0 whitespace-nowrap"
      >
        <Send class="w-3.5 h-3.5" />
        <span>Commit to {{ repoStore.repoInfo?.head_branch || 'main' }}</span>
      </button>
    </div>
  </div>
</template>
