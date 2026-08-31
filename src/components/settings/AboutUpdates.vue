<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  CheckCircle2,
  ChevronDown,
  DownloadCloud,
  ExternalLink,
  Laptop,
  RefreshCw,
} from 'lucide-vue-next';
import { useI18n } from '@/i18n';
import { renderReleaseMarkdown, useUpdatesStore } from '@/stores/updates';

const updates = useUpdatesStore();
const { locale, t } = useI18n();
const expandedVersion = ref<string | null>(null);
const RELEASES_PER_PAGE = 10;
const visibleReleaseCount = ref(RELEASES_PER_PAGE);

const visibleReleases = computed(() => updates.releaseHistory.slice(0, visibleReleaseCount.value));
const canLoadMore = computed(() => (
  visibleReleaseCount.value < updates.releaseHistory.length || updates.hasMoreReleaseNotes
));

const runtimeLabel = computed(() => updates.isDesktop ? t('Desktop') : t('Web'));
const platformLabel = computed(() => {
  const platform = navigator.platform || navigator.userAgent;
  const arch = /arm64|aarch64/i.test(navigator.userAgent)
    ? 'arm64'
    : /x86_64|win64|x64|amd64/i.test(navigator.userAgent)
      ? 'x86_64'
      : t('Unknown architecture');
  return `${platform} · ${arch}`;
});

function formatDate(value: string) {
  if (!value) return t('Unknown date');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function toggleRelease(version: string) {
  expandedVersion.value = expandedVersion.value === version ? null : version;
}

async function loadMoreReleases() {
  const targetCount = visibleReleaseCount.value + RELEASES_PER_PAGE;
  if (updates.releaseHistory.length < targetCount && updates.hasMoreReleaseNotes) {
    await updates.loadMoreReleaseHistory();
  }
  visibleReleaseCount.value = Math.min(targetCount, updates.releaseHistory.length);
}

async function refreshReleases() {
  visibleReleaseCount.value = RELEASES_PER_PAGE;
  expandedVersion.value = null;
  await updates.refreshReleaseHistory();
}

onMounted(async () => {
  await updates.initialize();
  await updates.loadReleaseHistory();
});
</script>

<template>
  <div class="space-y-4">
    <section class="rounded-lg border border-border bg-background/60 p-4">
      <div class="flex items-start gap-3">
        <img src="/favicon.png" alt="GITBX" class="h-12 w-12 rounded-lg" />
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-base font-bold text-foreground">GITBX</h2>
            <span class="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
              v{{ updates.currentVersion }}
            </span>
          </div>
          <p class="mt-1 text-[11px] text-muted-foreground">
            {{ t('Next-generation lightweight Git desktop client') }}
          </p>
        </div>
        <CheckCircle2 v-if="updates.latestVersion === updates.currentVersion" class="h-5 w-5 text-emerald-500" />
      </div>

      <div class="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div class="rounded border border-border bg-card px-3 py-2">
          <div class="text-[10px] text-muted-foreground">{{ t('Runtime') }}</div>
          <div class="mt-0.5 flex items-center gap-1.5 font-medium">
            <Laptop class="h-3.5 w-3.5" />
            {{ runtimeLabel }}
          </div>
        </div>
        <div class="rounded border border-border bg-card px-3 py-2">
          <div class="text-[10px] text-muted-foreground">{{ t('Platform') }}</div>
          <div class="mt-0.5 truncate font-mono text-[11px]" :title="platformLabel">{{ platformLabel }}</div>
        </div>
      </div>
    </section>

    <section class="overflow-hidden rounded-lg border border-border bg-background/60">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h3 class="font-semibold text-foreground">{{ t('Release notes') }}</h3>
          <p class="mt-0.5 text-[10px] text-muted-foreground">{{ t('Review changes from recent GITBX releases.') }}</p>
        </div>
        <div class="flex items-center gap-1.5">
          <button
            class="inline-flex items-center gap-1 rounded border border-border bg-card px-2.5 py-1.5 hover:bg-accent disabled:opacity-50"
            :disabled="updates.isBusy"
            @click="updates.checkForUpdates(true)"
          >
            <DownloadCloud class="h-3.5 w-3.5" />
            {{ updates.status === 'checking' ? t('Checking...') : t('Check for updates') }}
          </button>
          <button
            class="inline-flex items-center gap-1 rounded border border-border bg-card px-2.5 py-1.5 hover:bg-accent"
            @click="updates.openReleasePage()"
          >
            <ExternalLink class="h-3.5 w-3.5" />
            {{ t('View online') }}
          </button>
          <button
            class="rounded border border-border bg-card p-1.5 hover:bg-accent disabled:opacity-50"
            :title="t('Refresh release notes')"
            :disabled="updates.releaseHistoryLoading"
            @click="refreshReleases"
          >
            <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': updates.releaseHistoryLoading }" />
          </button>
        </div>
      </div>

      <div v-if="updates.releaseHistory.length" class="divide-y divide-border">
        <article v-for="(release, index) in visibleReleases" :key="release.version">
          <button
            class="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-accent/60"
            @click="toggleRelease(release.version)"
          >
            <span class="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
              v{{ release.version }}
            </span>
            <span v-if="index === 0" class="rounded bg-foreground px-1.5 py-0.5 text-[9px] font-bold text-background">NEW</span>
            <span class="flex-1 text-[10px] text-muted-foreground">
              {{ t('Released on {date}', { date: formatDate(release.publishedAt) }) }}
            </span>
            <span
              class="rounded p-1 hover:bg-muted"
              role="button"
              tabindex="0"
              :title="t('View online')"
              @click.stop="updates.openReleasePage(release.htmlUrl)"
              @keydown.enter.stop="updates.openReleasePage(release.htmlUrl)"
            >
              <ExternalLink class="h-3 w-3" />
            </span>
            <ChevronDown
              class="h-3.5 w-3.5 transition-transform"
              :class="{ 'rotate-180': expandedVersion === release.version }"
            />
          </button>
          <div v-if="expandedVersion === release.version" class="border-t border-border bg-card/60 px-5 py-3">
            <div
              class="release-markdown max-h-64 overflow-y-auto text-[11px] leading-5 text-foreground"
              v-html="renderReleaseMarkdown(release.body || t('No release notes provided.'))"
            />
          </div>
        </article>
      </div>

      <div v-else-if="updates.releaseHistoryLoading" class="px-4 py-8 text-center text-muted-foreground">
        <RefreshCw class="mx-auto mb-2 h-4 w-4 animate-spin" />
        {{ t('Loading release notes...') }}
      </div>
      <div v-else class="px-4 py-8 text-center text-muted-foreground">
        {{ t('Release notes are temporarily unavailable.') }}
      </div>

      <div v-if="updates.releaseHistoryError" class="border-t border-border px-4 py-2 text-[10px] text-amber-500">
        <template v-if="updates.releaseHistoryUsingFallback">
          {{ t('GitHub is temporarily unavailable. Showing bundled release notes.') }}
        </template>
        <template v-else>
          {{ t('Release notes are temporarily unavailable.') }} {{ updates.releaseHistoryError }}
        </template>
      </div>

      <button
        v-if="updates.releaseHistory.length && canLoadMore"
        class="w-full border-t border-border py-2 text-center hover:bg-accent disabled:opacity-50"
        :disabled="updates.releaseHistoryLoading"
        @click="loadMoreReleases"
      >
        {{ updates.releaseHistoryLoading ? t('Loading...') : t('Load more') }}
      </button>
    </section>
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

.release-markdown :deep(ul) {
  list-style: disc;
}

.release-markdown :deep(ol) {
  list-style: decimal;
}

.release-markdown :deep(code) {
  border-radius: 3px;
  background: hsl(var(--muted));
  padding: 0.05rem 0.25rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.release-markdown :deep(a) {
  color: hsl(var(--primary));
  text-decoration: underline;
}
</style>
