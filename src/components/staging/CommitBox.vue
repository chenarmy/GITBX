<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { useSettingsStore } from '@/stores/settings';
import { useAiStore } from '@/stores/ai';
import { useNotificationStore } from '@/stores/notification';
import { Sparkles, Send, ArrowUpCircle, Settings2, FileText } from 'lucide-vue-next';
import { useGitApi } from '@/composables/useGitApi';
import { usePushRecovery } from '@/composables/usePushRecovery';
import { useI18n } from '@/i18n';

const repoStore = useRepoStore();
const settingsStore = useSettingsStore();
const aiStore = useAiStore();
const notification = useNotificationStore();
const gitApi = useGitApi();
const { pushWithRecovery } = usePushRecovery();
const { t } = useI18n();

const isSubmitting = ref(false);
const showAdvanced = ref(false);
const amend = ref(false);
const signCommit = ref(localStorage.getItem('gitbx_sign_commits') === 'true');
const preCommitCommand = ref(localStorage.getItem('gitbx_pre_commit_command') || '');
const commitTemplate = ref<string | null>(null);
// Keep the AI result and the editable Summary on one reactive source.
// This makes Apply deterministic even while the AI modal is closing.
const commitMessage = computed({
  get: () => aiStore.draftCommitMessage,
  set: (value: string) => {
    aiStore.draftCommitMessage = value;
  },
});

const CONVENTIONAL_TAGS = ['feat', 'fix', 'refactor', 'docs', 'chore', 'perf'];

watch(() => repoStore.activeRepoPath, async (repoPath) => {
  commitTemplate.value = repoPath ? await gitApi.getCommitTemplate(repoPath).catch(() => null) : null;
}, { immediate: true });

function applyTemplate() {
  if (commitTemplate.value) commitMessage.value = commitTemplate.value;
}

function persistCommitOptions() {
  localStorage.setItem('gitbx_sign_commits', String(signCommit.value));
  localStorage.setItem('gitbx_pre_commit_command', preCommitCommand.value);
}

function insertPrefix(tag: string) {
  commitMessage.value = `${tag}: ${commitMessage.value.replace(/^(feat|fix|refactor|docs|chore|perf):\s*/, '')}`;
}

async function handleCommit() {
  if (!commitMessage.value.trim()) return;
  isSubmitting.value = true;
  try {
    if (!amend.value) await repoStore.prepareSelectedChanges();
    await repoStore.commit(
      commitMessage.value,
      settingsStore.authorName,
      settingsStore.authorEmail,
      { amend: amend.value, sign: signCommit.value, preCommitCommand: preCommitCommand.value.trim() || undefined },
    );
    notification.success(t('Commit Created'), commitMessage.value);
    aiStore.draftCommitMessage = '';
    amend.value = false;
    persistCommitOptions();
  } catch (err: any) {
    notification.error(t('Commit Failed'), err?.message);
  } finally {
    isSubmitting.value = false;
  }
}

async function handleCommitAndPush() {
  if (!commitMessage.value.trim()) return;
  isSubmitting.value = true;
  try {
    if (!amend.value) await repoStore.prepareSelectedChanges();
    await repoStore.commit(
      commitMessage.value,
      settingsStore.authorName,
      settingsStore.authorEmail,
      { amend: amend.value, sign: signCommit.value, preCommitCommand: preCommitCommand.value.trim() || undefined },
    );
    notification.success(t('Commit Created'), commitMessage.value);
    aiStore.draftCommitMessage = '';
    amend.value = false;
    persistCommitOptions();

    notification.info(t('Git Push'), t("Pushing commits to remote..."));
    const pushed = await pushWithRecovery();
    if (!pushed) return;
    notification.success(t('Push Completed'), t('Local commits pushed successfully.'));
  } catch (err: any) {
    notification.error(t('Push Failed'), err?.message || String(err));
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div class="dbx-commit-box h-full min-h-0 overflow-hidden bg-card flex flex-col p-3 text-xs select-none">
    <!-- Conventional Commit shortcuts & AI Trigger -->
    <div class="commit-tools mb-2 flex min-w-0 items-center gap-1">
      <div class="commit-shortcuts flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        <button
          v-for="tag in CONVENTIONAL_TAGS"
          :key="tag"
          @click="insertPrefix(tag)"
          class="shortcut-tag px-2 py-0.5 rounded-[4px] bg-secondary/90 hover:bg-primary/10 hover:text-primary hover:border-primary/35 border border-border/70 text-muted-foreground font-mono text-[10px] font-medium transition-colors shrink-0"
        >
          {{ tag }}
        </button>
      </div>

      <div class="ml-auto flex shrink-0 items-center gap-1">
        <button v-if="commitTemplate" @click="applyTemplate" class="arco-icon-btn arco-icon-btn-sm" :title="t('Apply Commit Template')"><FileText class="w-3.5 h-3.5" /></button>
        <button
          @click="aiStore.openAiModal()"
          class="arco-btn arco-btn-sm bg-primary/10 hover:bg-primary/15 text-primary border border-primary/25 h-6 px-2 shrink-0 whitespace-nowrap"
          :title="t('Open AI Commit & Assistant Modal')"
        >
          <Sparkles class="w-3 h-3 text-primary" />
          <span class="ai-message-label">{{ t('AI Msg') }}</span>
        </button>
        <button @click="showAdvanced = !showAdvanced" class="arco-icon-btn arco-icon-btn-sm" :class="showAdvanced ? 'text-primary bg-primary/10' : ''" :title="t('Commit Options')"><Settings2 class="w-3.5 h-3.5" /></button>
      </div>
    </div>

    <!-- Commit message input -->
    <textarea
      v-model="commitMessage"
      :placeholder="t('Commit summary (e.g. feat: add Canvas graph view)...')"
      class="arco-textarea flex-1 w-full font-sans resize-none min-h-[60px]"
    ></textarea>

    <div v-if="showAdvanced" class="mt-2 grid grid-cols-[auto_auto_1fr] gap-3 items-center text-[11px] text-foreground">
      <label class="flex items-center gap-1.5 cursor-pointer"><input v-model="amend" type="checkbox" />{{ t('Amend Previous Commit') }}</label>
      <label class="flex items-center gap-1.5 cursor-pointer"><input v-model="signCommit" type="checkbox" />{{ t('Sign Commit') }}</label>
      <input v-model="preCommitCommand" class="arco-input arco-input-sm min-w-0 font-mono" :placeholder="t('Pre-commit command (optional)')" />
    </div>

    <!-- Bottom Actions: Author info & Commit / Push Buttons -->
    <div class="flex items-center justify-between mt-2.5 pt-2 border-t border-border/80 gap-2">
      <div class="text-[11px] text-muted-foreground truncate flex-1">
        {{ t('Committer:') }} <span class="font-semibold text-foreground">{{ settingsStore.authorName }}</span>
        <span v-if="!amend" class="ml-1 tabular-nums">· {{ t('{count} selected', { count: repoStore.selectedChangePaths.length }) }}</span>
      </div>

      <div class="flex items-center gap-1.5">
        <button
          @click="handleCommit"
          :disabled="!commitMessage.trim() || isSubmitting || (!amend && repoStore.selectedChangePaths.length === 0)"
          class="arco-btn arco-btn-primary shrink-0 whitespace-nowrap"
          :title="t('Commit to {branch}', { branch: repoStore.repoInfo?.head_branch || 'main' })"
        >
          <Send class="w-3.5 h-3.5" />
          <span>{{ t('Commit') }}</span>
        </button>

        <button
          @click="handleCommitAndPush"
          :disabled="!commitMessage.trim() || isSubmitting || (!amend && repoStore.selectedChangePaths.length === 0)"
          class="arco-btn arco-btn-success shrink-0 whitespace-nowrap"
          :title="t('Commit and Push to remote')"
        >
          <ArrowUpCircle class="w-3.5 h-3.5" />
          <span>{{ t('Commit & Push') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dbx-commit-box { container-type: inline-size; }

@container (max-width: 330px) {
  .shortcut-tag:nth-child(n + 4) { display: none; }
  .ai-message-label { display: none; }
}

@container (max-width: 255px) {
  .shortcut-tag:nth-child(n + 3) { display: none; }
}
</style>
