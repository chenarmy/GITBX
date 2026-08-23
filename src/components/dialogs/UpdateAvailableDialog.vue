<script setup lang="ts">
import { computed } from 'vue';
import { Download, ExternalLink, X } from 'lucide-vue-next';
import { useI18n } from '@/i18n';
import { renderReleaseMarkdown, useUpdatesStore } from '@/stores/updates';

const updates = useUpdatesStore();
const { t } = useI18n();
const renderedNotes = computed(() => renderReleaseMarkdown(
  updates.notes || t('No release notes provided.'),
));
</script>

<template>
  <div
    v-if="updates.isDialogOpen"
    class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
  >
    <div class="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-card text-xs">
      <header class="flex h-12 items-center justify-between border-b border-border px-4">
        <h2 class="text-sm font-bold">{{ t('New version available') }}</h2>
        <button
          class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          :disabled="updates.status === 'downloading'"
          @click="updates.cancelUpdate()"
        >
          <X class="h-4 w-4" />
        </button>
      </header>

      <div class="flex-1 space-y-3 overflow-hidden p-4">
        <p>
          {{ t('GITBX {latest} is available. You are using {current}.', {
            latest: updates.latestVersion || '',
            current: updates.currentVersion,
          }) }}
        </p>

        <div class="release-markdown max-h-72 overflow-y-auto rounded border border-border bg-background p-3 leading-5" v-html="renderedNotes" />

        <div v-if="updates.status === 'downloading' || updates.status === 'ready'" class="space-y-1.5">
          <div class="flex justify-between text-[10px] text-muted-foreground">
            <span>{{ updates.status === 'ready' ? t('Installing update...') : t('Downloading update...') }}</span>
            <span>{{ updates.progress }}%</span>
          </div>
          <div class="h-1.5 overflow-hidden rounded-full bg-muted">
            <div class="h-full bg-primary transition-all" :style="{ width: `${updates.progress}%` }" />
          </div>
        </div>

        <div v-if="updates.error" class="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive">
          {{ updates.error }}
        </div>
      </div>

      <footer class="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-muted/30 px-4 py-3">
        <button
          class="rounded border border-border bg-card px-3 py-1.5 hover:bg-accent disabled:opacity-50"
          :disabled="updates.status === 'downloading'"
          @click="updates.cancelUpdate()"
        >
          {{ t('Cancel') }}
        </button>
        <button
          class="rounded px-3 py-1.5 text-muted-foreground hover:bg-accent disabled:opacity-50"
          :disabled="updates.status === 'downloading' || !updates.latestVersion"
          @click="updates.latestVersion && updates.skipVersion(updates.latestVersion)"
        >
          {{ t('Skip this version') }}
        </button>
        <button
          class="inline-flex items-center gap-1 rounded border border-border bg-card px-3 py-1.5 hover:bg-accent"
          @click="updates.openReleasePage()"
        >
          <ExternalLink class="h-3.5 w-3.5" />
          {{ t('Open download page') }}
        </button>
        <button
          class="inline-flex items-center gap-1 rounded bg-primary px-3 py-1.5 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          :disabled="updates.status === 'downloading' || updates.status === 'ready'"
          @click="updates.downloadAndInstall()"
        >
          <Download class="h-3.5 w-3.5" />
          {{ updates.status === 'downloading' ? t('Downloading...') : t('Download and install') }}
        </button>
      </footer>
    </div>
  </div>
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
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.release-markdown :deep(a) { color: hsl(var(--primary)); text-decoration: underline; }
</style>
