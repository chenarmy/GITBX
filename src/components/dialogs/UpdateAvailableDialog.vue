<script setup lang="ts">
import { computed } from 'vue';
import { Download, ExternalLink } from 'lucide-vue-next';
import ArcoModal from '@/components/ui/ArcoModal.vue';
import { useI18n } from '@/i18n';
import { renderReleaseMarkdown, useUpdatesStore } from '@/stores/updates';

const updates = useUpdatesStore();
const { t } = useI18n();
const renderedNotes = computed(() => renderReleaseMarkdown(
  updates.notes || t('No release notes provided.'),
));
</script>

<template>
  <ArcoModal
    v-if="updates.isDialogOpen"
    :title="t('New version available')"
    max-width-class="max-w-xl"
    height-class="max-h-[80vh]"
    z-index-class="z-[60]"
    :close-disabled="updates.status === 'downloading'"
    body-class="flex-1 space-y-3 overflow-hidden"
    footer-class="flex-wrap"
    @close="updates.cancelUpdate()"
  >
    <template #icon>
      <Download class="w-4 h-4" />
    </template>

    <p class="text-[12px] text-foreground leading-relaxed">
      {{ t('GITBX {latest} is available. You are using {current}.', {
        latest: updates.latestVersion || '',
        current: updates.currentVersion,
      }) }}
    </p>

    <div
      class="release-markdown arco-card max-h-72 overflow-y-auto bg-[hsl(var(--arco-fill-1))] p-3.5 text-[12px] leading-5"
      v-html="renderedNotes"
    />

    <div v-if="updates.status === 'downloading' || updates.status === 'ready'" class="space-y-1.5">
      <div class="flex justify-between text-[11px] font-medium text-muted-foreground tabular-nums">
        <span>{{ updates.status === 'ready' ? t('Installing update...') : t('Downloading update...') }}</span>
        <span class="text-primary">{{ updates.progress }}%</span>
      </div>
      <div class="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          class="h-full rounded-full bg-primary transition-all duration-200"
          :style="{ width: `${updates.progress}%` }"
        />
      </div>
    </div>

    <div v-if="updates.error" class="arco-alert arco-alert-danger">
      {{ updates.error }}
    </div>

    <template #footer>
      <button
        type="button"
        class="arco-btn arco-btn-secondary"
        :disabled="updates.status === 'downloading'"
        @click="updates.cancelUpdate()"
      >
        {{ t('Cancel') }}
      </button>
      <button
        type="button"
        class="arco-btn arco-btn-text"
        :disabled="updates.status === 'downloading' || !updates.latestVersion"
        @click="updates.latestVersion && updates.skipVersion(updates.latestVersion)"
      >
        {{ t('Skip this version') }}
      </button>
      <button
        type="button"
        class="arco-btn arco-btn-outline"
        @click="updates.openReleasePage()"
      >
        <ExternalLink class="h-3.5 w-3.5" />
        {{ t('Open download page') }}
      </button>
      <button
        type="button"
        class="arco-btn arco-btn-primary"
        :disabled="updates.status === 'downloading' || updates.status === 'ready'"
        @click="updates.downloadAndInstall()"
      >
        <Download class="h-3.5 w-3.5" />
        {{ updates.status === 'downloading' ? t('Downloading...') : t('Download and install') }}
      </button>
    </template>
  </ArcoModal>
</template>

<style scoped>
.release-markdown :deep(h1),
.release-markdown :deep(h2),
.release-markdown :deep(h3) {
  margin: 0.75rem 0 0.25rem;
  font-weight: 700;
}

.release-markdown :deep(ul),
.release-markdown :deep(ol) {
  margin: 0.35rem 0;
  padding-left: 1.25rem;
}

.release-markdown :deep(ul) { list-style: disc; }
.release-markdown :deep(ol) { list-style: decimal; }
.release-markdown :deep(code) {
  border-radius: 3px;
  background: hsl(var(--muted));
  padding: 0.05rem 0.25rem;
  font-family: var(--gitbx-mono-family);
}
.release-markdown :deep(a) { color: hsl(var(--primary)); text-decoration: underline; }
</style>
