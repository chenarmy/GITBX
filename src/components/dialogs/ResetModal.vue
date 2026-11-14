<script setup lang="ts">
import { ref } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { useNotificationStore } from '@/stores/notification';
import { RotateCcw, AlertTriangle } from 'lucide-vue-next';
import ArcoModal from '@/components/ui/ArcoModal.vue';
import { useI18n } from '@/i18n';

const repoStore = useRepoStore();
const notification = useNotificationStore();
const { t } = useI18n();

const resetMode = ref<'--soft' | '--mixed' | '--hard'>('--mixed');
const isSubmitting = ref(false);

async function handleReset() {
  if (!repoStore.selectedCommit) return;
  isSubmitting.value = true;
  try {
    await repoStore.reset(repoStore.selectedCommit.id, resetMode.value);
    repoStore.closeModal('reset');
  } catch (err: any) {
    notification.error(t('Reset Failed', undefined) || 'Reset Failed', err?.message || 'Failed to reset');
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <ArcoModal
    v-if="repoStore.isResetModalOpen"
    :title="t('Reset Branch to Commit')"
    icon-bg-class="bg-[hsl(var(--arco-danger)/0.12)] text-[hsl(var(--arco-danger))]"
    body-class="space-y-4"
    @close="repoStore.closeModal('reset')"
  >
    <template #icon>
      <RotateCcw class="w-4 h-4" aria-hidden="true" />
    </template>

    <div class="rounded-[6px] border border-border/80 bg-[hsl(var(--arco-fill-1))] p-3 space-y-1">
      <div class="text-[11px] text-muted-foreground">{{ t('Target Commit:') }}</div>
      <div class="font-mono text-foreground text-[12px]">
        {{ repoStore.selectedCommit?.short_id }} - {{ repoStore.selectedCommit?.summary }}
      </div>
    </div>

    <div class="space-y-2">
      <label class="text-[11px] font-semibold text-muted-foreground">{{ t('Reset Type') }}</label>

      <label
        class="flex items-start space-x-2.5 p-2.5 rounded-[6px] border cursor-pointer transition-colors"
        :class="resetMode === '--soft' ? 'border-primary/50 bg-primary/[0.04]' : 'border-border/80 bg-[hsl(var(--arco-fill-1))] hover:bg-accent/55'"
      >
        <input type="radio" v-model="resetMode" value="--soft" class="mt-0.5 accent-[hsl(var(--primary))]" />
        <div>
          <div class="font-semibold text-foreground">{{ t('Soft (--soft)') }}</div>
          <div class="text-[11px] text-muted-foreground mt-0.5">{{ t('Keep all changes staged in the index. No file changes are lost.') }}</div>
        </div>
      </label>

      <label
        class="flex items-start space-x-2.5 p-2.5 rounded-[6px] border cursor-pointer transition-colors"
        :class="resetMode === '--mixed' ? 'border-primary/50 bg-primary/[0.04]' : 'border-border/80 bg-[hsl(var(--arco-fill-1))] hover:bg-accent/55'"
      >
        <input type="radio" v-model="resetMode" value="--mixed" class="mt-0.5 accent-[hsl(var(--primary))]" />
        <div>
          <div class="font-semibold text-foreground">{{ t('Mixed (--mixed, Default)') }}</div>
          <div class="text-[11px] text-muted-foreground mt-0.5">{{ t('Keep all working tree changes unstaged. Index is reset.') }}</div>
        </div>
      </label>

      <label
        class="flex items-start space-x-2.5 p-2.5 rounded-[6px] border cursor-pointer transition-colors"
        :class="resetMode === '--hard' ? 'border-[hsl(var(--arco-danger)/0.6)] bg-[hsl(var(--arco-danger)/0.1)]' : 'border-[hsl(var(--arco-danger)/0.3)] bg-[hsl(var(--arco-danger)/0.05)] hover:bg-[hsl(var(--arco-danger)/0.08)]'"
      >
        <input type="radio" v-model="resetMode" value="--hard" class="mt-0.5 accent-[hsl(var(--arco-danger))]" />
        <div>
          <div class="font-semibold text-[hsl(var(--arco-danger))] flex items-center space-x-1">
            <span>{{ t('Hard (--hard)') }}</span>
            <AlertTriangle class="w-3.5 h-3.5" />
          </div>
          <div class="text-[11px] text-[hsl(var(--arco-danger)/0.85)] mt-0.5">{{ t('Discard all working tree and staged changes. Irreversible!') }}</div>
        </div>
      </label>
    </div>

    <template #footer>
      <button
        type="button"
        @click="repoStore.closeModal('reset')"
        class="arco-btn arco-btn-secondary"
      >
        {{ t('Cancel') }}
      </button>
      <button
        type="button"
        @click="handleReset"
        :disabled="isSubmitting"
        class="arco-btn"
        :class="resetMode === '--hard' ? 'arco-btn-danger' : 'arco-btn-primary'"
      >
        {{ isSubmitting ? t('Resetting...') : t('Reset') }}
      </button>
    </template>
  </ArcoModal>
</template>
