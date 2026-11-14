<script setup lang="ts">
import { ref, watch } from 'vue';
import { GitPullRequest } from 'lucide-vue-next';
import ArcoModal from '@/components/ui/ArcoModal.vue';
import { useRepoStore } from '@/stores/repo';
import { useNotificationStore } from '@/stores/notification';
import { useGitApi, formatGitError } from '@/composables/useGitApi';
import { useI18n } from '@/i18n';
const repoStore = useRepoStore(); const notification = useNotificationStore(); const gitApi = useGitApi(); const { t } = useI18n();
const base = ref('main'); const compare = ref(''); const submitting = ref(false);
watch(() => repoStore.isPullRequestOpen, (open) => {
  if (open) {
    compare.value = repoStore.repoInfo?.head_branch || '';
    const defaultBranch = repoStore.branches.some(b => b.name === 'main' || b.name === 'origin/main')
      ? 'main'
      : repoStore.branches.some(b => b.name === 'master' || b.name === 'origin/master')
      ? 'master'
      : 'main';
    base.value = compare.value === defaultBranch
      ? (repoStore.branches.some(b => b.name === 'develop' || b.name === 'origin/develop') ? 'develop' : defaultBranch)
      : defaultBranch;
  }
});
async function open() {
  submitting.value = true;
  try {
    await gitApi.openPullRequest(repoStore.activeRepoPath, base.value, compare.value);
    repoStore.closeModal('pullRequest');
  } catch (error) {
    notification.error(t('Unable to Create PR/MR'), formatGitError(error));
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <ArcoModal
    v-if="repoStore.isPullRequestOpen"
    :title="t('Create Pull or Merge Request')"
    max-width-class="max-w-lg"
    icon-bg-class="bg-fuchsia-500/10 text-fuchsia-500"
    body-class="space-y-4"
    @close="repoStore.closeModal('pullRequest')"
  >
    <template #icon>
      <GitPullRequest class="w-4 h-4" aria-hidden="true" />
    </template>

    <p class="text-[12px] text-muted-foreground leading-relaxed">
      {{ t('Open the remote provider with the source and target branches preselected.') }}
    </p>
    <label class="block space-y-1.5">
      <span class="text-[11px] font-semibold text-muted-foreground">{{ t('Target Branch') }}</span>
      <input v-model="base" class="arco-input font-mono" />
    </label>
    <label class="block space-y-1.5">
      <span class="text-[11px] font-semibold text-muted-foreground">{{ t('Source Branch') }}</span>
      <input v-model="compare" class="arco-input font-mono" />
    </label>

    <template #footer>
      <button
        type="button"
        class="arco-btn arco-btn-secondary"
        @click="repoStore.closeModal('pullRequest')"
      >
        {{ t('Cancel') }}
      </button>
      <button
        type="button"
        class="arco-btn arco-btn-primary"
        :disabled="!base.trim() || !compare.trim() || submitting"
        @click="open"
      >
        {{ t('Open PR/MR') }}
      </button>
    </template>
  </ArcoModal>
</template>
