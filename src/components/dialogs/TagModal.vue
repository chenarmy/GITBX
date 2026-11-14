<script setup lang="ts">
import { ref } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { Tag, AlertCircle } from 'lucide-vue-next';
import ArcoModal from '@/components/ui/ArcoModal.vue';
import { useI18n } from '@/i18n';

const repoStore = useRepoStore();
const { t } = useI18n();

const tagName = ref('');
const tagMessage = ref('');
const pushToRemote = ref(false);
const isSubmitting = ref(false);
const errorMsg = ref<string | null>(null);

async function handleCreate() {
  if (!tagName.value.trim()) return;
  isSubmitting.value = true;
  errorMsg.value = null;
  try {
    await repoStore.createTag(
      tagName.value.trim(),
      tagMessage.value.trim() || undefined,
      repoStore.selectedCommit?.id,
      pushToRemote.value,
    );
    tagName.value = '';
    tagMessage.value = '';
    pushToRemote.value = false;
    repoStore.closeModal('tag');
  } catch (err: any) {
    errorMsg.value = err?.message || 'Failed to create tag';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <ArcoModal
    v-if="repoStore.isTagModalOpen"
    :title="t('Create New Tag')"
    icon-bg-class="bg-amber-500/10 text-amber-500"
    body-class="space-y-4"
    @close="repoStore.closeModal('tag')"
  >
    <template #icon>
      <Tag class="w-4 h-4" aria-hidden="true" />
    </template>

    <div v-if="errorMsg" class="arco-alert arco-alert-danger">
      <AlertCircle class="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>{{ errorMsg }}</span>
    </div>

    <div>
      <label class="text-[11px] font-semibold text-muted-foreground">{{ t('Tag Name') }}</label>
      <input
        v-model="tagName"
        type="text"
        placeholder="e.g. v1.0.0 or release-2026.08"
        class="arco-input mt-1.5"
        @keydown.enter="handleCreate"
      />
    </div>

    <div>
      <label class="text-[11px] font-semibold text-muted-foreground">{{ t('Message (Optional)') }}</label>
      <textarea
        v-model="tagMessage"
        rows="2"
        placeholder="Tag annotation release note..."
        class="arco-textarea mt-1.5"
      ></textarea>
    </div>

    <div class="rounded-[6px] border border-border/80 bg-[hsl(var(--arco-fill-1))] p-3 space-y-1">
      <div class="text-[11px] text-muted-foreground">{{ t('Target Commit:') }}</div>
      <div class="font-mono text-foreground text-[12px]">
        {{ repoStore.selectedCommit ? `${repoStore.selectedCommit.short_id} - ${repoStore.selectedCommit.summary}` : t('Current HEAD') }}
      </div>
    </div>

    <label v-if="repoStore.remotes.length > 0" class="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
      <input type="checkbox" v-model="pushToRemote" class="accent-[hsl(var(--primary))] rounded" />
      <span>{{ t('Push tag to remote') }}</span>
    </label>

    <template #footer>
      <button
        type="button"
        @click="repoStore.closeModal('tag')"
        class="arco-btn arco-btn-secondary"
      >
        {{ t('Cancel') }}
      </button>
      <button
        type="button"
        @click="handleCreate"
        :disabled="!tagName.trim() || isSubmitting"
        class="arco-btn arco-btn-primary"
      >
        {{ isSubmitting ? 'Creating...' : t('Create Tag') }}
      </button>
    </template>
  </ArcoModal>
</template>
