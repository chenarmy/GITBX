<script setup lang="ts">
import { ref } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { useI18n } from '@/i18n';
import { Archive, X, AlertCircle } from 'lucide-vue-next';

const repoStore = useRepoStore();
const { t } = useI18n();

const stashMessage = ref('');
const isSubmitting = ref(false);
const errorMsg = ref<string | null>(null);

async function handleStash() {
  isSubmitting.value = true;
  errorMsg.value = null;
  try {
    await repoStore.createStash(stashMessage.value.trim() || undefined);
    stashMessage.value = '';
    repoStore.isStashModalOpen = false;
  } catch (err: any) {
    errorMsg.value = err?.message || t('Failed to stash changes');
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div
    v-if="repoStore.isStashModalOpen"
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
  >
    <div
      class="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs"
    >
      <div class="h-11 bg-muted/50 px-4 flex items-center justify-between border-b border-border select-none">
        <div class="flex items-center space-x-2">
          <Archive class="w-4 h-4 text-orange-400" />
          <span class="font-bold text-sm text-foreground">{{ t('Stash Changes') }}</span>
        </div>
        <button
          @click="repoStore.isStashModalOpen = false"
          class="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <div class="p-4 space-y-4">
        <div
          v-if="errorMsg"
          class="p-2.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-center space-x-2"
        >
          <AlertCircle class="w-4 h-4 shrink-0" />
          <span>{{ errorMsg }}</span>
        </div>

        <div>
          <label class="text-[11px] font-semibold text-muted-foreground">{{ t('Stash Message (Optional)') }}</label>
          <input
            v-model="stashMessage"
            type="text"
            :placeholder="t('e.g. WIP: refactoring parser logic')"
            class="w-full bg-background border border-border rounded px-3 py-2 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            @keydown.enter="handleStash"
          />
          <p class="text-[10px] text-muted-foreground mt-1">
            {{ t('Saves your uncommitted changes (both staged and unstaged) to stash and restores clean working tree.') }}
          </p>
        </div>
      </div>

      <div class="h-12 bg-muted/30 px-4 flex items-center justify-end space-x-2 border-t border-border">
        <button
          @click="repoStore.isStashModalOpen = false"
          class="px-3 py-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition"
        >
          {{ t('Cancel') }}
        </button>
        <button
          @click="handleStash"
          :disabled="isSubmitting"
          class="px-4 py-1.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition disabled:opacity-40"
        >
          {{ isSubmitting ? t('Stashing...') : t('Save Stash') }}
        </button>
      </div>
    </div>
  </div>
</template>
