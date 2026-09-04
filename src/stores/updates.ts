import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type Update } from '@tauri-apps/plugin-updater';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import packageJson from '../../package.json';
import bundledChangelog from '../../CHANGELOG.md?raw';
import { useNotificationStore } from '@/stores/notification';
import { useSettingsStore } from '@/stores/settings';

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';

export interface ReleaseNote {
  version: string;
  publishedAt: string;
  body: string;
  htmlUrl: string;
  prerelease: boolean;
}

interface GitHubRelease {
  tag_name: string;
  published_at: string | null;
  body: string | null;
  html_url: string;
  prerelease: boolean;
  draft: boolean;
}

interface CnbRelease {
  tag_name: string;
  created_at?: string | null;
  published_at?: string | null;
  body?: string | null;
  html_url?: string;
  prerelease?: boolean;
  draft?: boolean;
}

interface ReleaseCache {
  fetchedAt: number;
  releases: ReleaseNote[];
}

const GITHUB_REPOSITORY = 'chenarmy/GITBX';
const RELEASES_PAGE_URL = `https://github.com/${GITHUB_REPOSITORY}/releases`;
const RELEASES_API_URL = `https://api.github.com/repos/${GITHUB_REPOSITORY}/releases`;
const CNB_REPOSITORY = 'chenarmy/GITBX';
const CNB_REPOSITORY_URL = `https://cnb.cool/${CNB_REPOSITORY}`;
const CNB_RELEASES_API_URL = `https://api.cnb.cool/${CNB_REPOSITORY}/-/releases`;
const RELEASE_CACHE_KEY = 'gitbx_release_notes_cache_v1';
const RELEASE_CACHE_TTL = 60 * 60 * 1000;
const RELEASE_PAGE_SIZE = 10;

let pendingUpdate: Update | null = null;

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function normalizeVersion(version: string) {
  return version.trim().replace(/^v/i, '');
}

function updateReleaseUrl(version: string) {
  return `${RELEASES_PAGE_URL}/tag/v${normalizeVersion(version)}`;
}

function parseBundledChangelog(markdown: string): ReleaseNote[] {
  const heading = /^## \[([^\]]+)](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?\s*$/gm;
  const matches = [...markdown.matchAll(heading)];

  return matches.map((match, index) => {
    const bodyStart = (match.index ?? 0) + match[0].length;
    const bodyEnd = matches[index + 1]?.index ?? markdown.length;
    const version = normalizeVersion(match[1]);

    return {
      version,
      publishedAt: match[2] ? `${match[2]}T00:00:00Z` : '',
      body: markdown.slice(bodyStart, bodyEnd).trim(),
      htmlUrl: updateReleaseUrl(version),
      prerelease: false,
    };
  });
}

function sortReleaseNotes(releases: ReleaseNote[]) {
  return [...releases].sort((left, right) => {
    const leftTimestamp = Date.parse(left.publishedAt);
    const rightTimestamp = Date.parse(right.publishedAt);
    const timestampDifference = (Number.isFinite(rightTimestamp) ? rightTimestamp : 0)
      - (Number.isFinite(leftTimestamp) ? leftTimestamp : 0);

    if (timestampDifference !== 0) return timestampDifference;

    return normalizeVersion(right.version).localeCompare(normalizeVersion(left.version), undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  });
}

function mergeReleaseNotes(primary: ReleaseNote[], fallback: ReleaseNote[]) {
  const versions = new Set(primary.map((release) => release.version));
  return sortReleaseNotes([
    ...primary,
    ...fallback.filter((release) => !versions.has(release.version)),
  ]);
}

const BUNDLED_RELEASES = sortReleaseNotes(parseBundledChangelog(bundledChangelog));

function readCachedReleases(): ReleaseCache | null {
  try {
    const raw = localStorage.getItem(RELEASE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReleaseCache>;
    if (!Array.isArray(parsed.releases) || typeof parsed.fetchedAt !== 'number') return null;
    return parsed as ReleaseCache;
  } catch {
    return null;
  }
}

function writeCachedReleases(releases: ReleaseNote[]) {
  try {
    localStorage.setItem(RELEASE_CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), releases }));
  } catch {
    // The live list remains usable when localStorage is unavailable.
  }
}

async function fetchCnbReleases(page: number, signal: AbortSignal): Promise<ReleaseNote[]> {
  const response = await fetch(`${CNB_RELEASES_API_URL}?page=${page}&page_size=${RELEASE_PAGE_SIZE}`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) throw new Error(`CNB returned HTTP ${response.status}`);
  const payload = await response.json() as CnbRelease[];
  return payload
    .filter((release) => !release.prerelease && !release.draft)
    .map((release) => ({
      version: normalizeVersion(release.tag_name),
      publishedAt: release.published_at || release.created_at || '',
      body: release.body || '',
      htmlUrl: release.html_url || CNB_REPOSITORY_URL,
      prerelease: false,
    }));
}

export function renderReleaseMarkdown(markdown: string) {
  const html = marked.parse(markdown || '', { async: false, gfm: true }) as string;
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'img', 'video', 'audio'],
    FORBID_ATTR: ['style'],
  });
}

export const useUpdatesStore = defineStore('updates', () => {
  const notification = useNotificationStore();
  const settings = useSettingsStore();

  const status = ref<UpdateStatus>('idle');
  const currentVersion = ref(packageJson.version);
  const latestVersion = ref<string | null>(null);
  const releaseUrl = ref<string>(`${RELEASES_PAGE_URL}/latest`);
  const notes = ref<string>('');
  const publishedAt = ref<string | null>(null);
  const progress = ref(0);
  const error = ref<string | null>(null);
  const isDialogOpen = ref(false);
  const releaseHistory = ref<ReleaseNote[]>(BUNDLED_RELEASES);
  const releasePage = ref(0);
  const releaseHistoryLoading = ref(false);
  const releaseHistoryError = ref<string | null>(null);
  const releaseHistoryUsingFallback = ref(false);
  const hasMoreReleaseNotes = ref(true);

  const isDesktop = computed(isTauriRuntime);
  const isBusy = computed(() => status.value === 'checking' || status.value === 'downloading');
  const lastUpdateCheckAt = computed(() => settings.lastUpdateCheckAt);
  const hasUpdateAvailable = computed(() => Boolean(
    latestVersion.value
      && latestVersion.value !== currentVersion.value
      && settings.skippedVersion !== latestVersion.value,
  ));

  const initialize = async () => {
    if (!isTauriRuntime()) return;
    try {
      currentVersion.value = await getVersion();
    } catch {
      currentVersion.value = packageJson.version;
    }
  };

  const checkForUpdates = async (manual = false, showDialog = true) => {
    if (status.value === 'checking' || status.value === 'downloading' || status.value === 'ready') return;
    status.value = 'checking';
    await initialize();
    error.value = null;

    if (!isTauriRuntime()) {
      status.value = 'idle';
      if (manual) {
        notification.info('Desktop update only', 'Automatic updates are available in the GITBX desktop app.');
      }
      return;
    }

    if (!__GITBX_UPDATER_CONFIGURED__) {
      status.value = 'error';
      error.value = 'The updater public key has not been configured for this build.';
      if (manual) notification.warning('Updater is not configured', error.value);
      return;
    }

    progress.value = 0;

    try {
      if (pendingUpdate) {
        await pendingUpdate.close();
        pendingUpdate = null;
      }

      const candidate = await check({ timeout: 15_000 });
      await settings.setLastUpdateCheckAt(Date.now());

      if (!candidate) {
        status.value = 'idle';
        latestVersion.value = currentVersion.value;
        if (manual) notification.success('GITBX is up to date', `Current version: ${currentVersion.value}`);
        return;
      }

      latestVersion.value = normalizeVersion(candidate.version);
      notes.value = candidate.body || '';
      publishedAt.value = candidate.date || null;
      const usesCnbMirror = JSON.stringify(candidate.rawJson).includes('cnb.cool');
      releaseUrl.value = usesCnbMirror
        ? CNB_REPOSITORY_URL
        : updateReleaseUrl(candidate.version);

      if (!manual && settings.skippedVersion === latestVersion.value) {
        await candidate.close();
        status.value = 'idle';
        return;
      }

      if (settings.skippedVersion && settings.skippedVersion !== latestVersion.value) {
        await settings.setSkippedVersion(null);
      }

      pendingUpdate = candidate;
      status.value = 'available';
      if (showDialog) isDialogOpen.value = true;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      error.value = message;
      status.value = 'error';
      if (manual) notification.error('Failed to check for updates', error.value);
    }
  };

  const downloadAndInstall = async () => {
    if (!pendingUpdate || status.value === 'downloading') return;
    status.value = 'downloading';
    progress.value = 0;
    error.value = null;
    let downloaded = 0;
    let contentLength = 0;

    try {
      await pendingUpdate.download((event) => {
        if (event.event === 'Started') {
          contentLength = event.data.contentLength ?? 0;
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          progress.value = contentLength > 0
            ? Math.min(99, Math.round((downloaded / contentLength) * 100))
            : 0;
        } else if (event.event === 'Finished') {
          progress.value = 100;
        }
      });
      status.value = 'ready';
      await pendingUpdate.install();
      await relaunch();
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught);
      status.value = 'error';
      notification.error('Update installation failed', error.value);
    }
  };

  const skipVersion = async (version: string) => {
    await settings.setSkippedVersion(normalizeVersion(version));
    isDialogOpen.value = false;
    status.value = 'idle';
    if (pendingUpdate) {
      await pendingUpdate.close();
      pendingUpdate = null;
    }
  };

  const openReleasePage = async (url = releaseUrl.value) => {
    const target = url || `${RELEASES_PAGE_URL}/latest`;
    try {
      if (isTauriRuntime()) {
        await invoke('open_release_url', { url: target });
      } else {
        window.open(target, '_blank', 'noopener,noreferrer');
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      notification.error('Failed to open release page', message);
    }
  };

  const loadReleaseHistory = async (page = 1, forceRefresh = false) => {
    if (releaseHistoryLoading.value) return;

    if (page === 1 && !forceRefresh) {
      const cache = readCachedReleases();
      if (cache && Date.now() - cache.fetchedAt < RELEASE_CACHE_TTL) {
        releaseHistory.value = mergeReleaseNotes(cache.releases, BUNDLED_RELEASES);
        releasePage.value = 1;
        hasMoreReleaseNotes.value = cache.releases.length >= RELEASE_PAGE_SIZE;
        releaseHistoryError.value = null;
        releaseHistoryUsingFallback.value = false;
        return;
      }
    }

    releaseHistoryLoading.value = true;
    releaseHistoryError.value = null;
    releaseHistoryUsingFallback.value = false;
    let controller = new AbortController();
    let timeout = window.setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(`${RELEASES_API_URL}?per_page=${RELEASE_PAGE_SIZE}&page=${page}`, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);

      const payload = await response.json() as GitHubRelease[];
      const releases = payload
        .filter((release) => !release.draft && !release.prerelease)
        .map((release) => ({
          version: normalizeVersion(release.tag_name),
          publishedAt: release.published_at || '',
          body: release.body || '',
          htmlUrl: release.html_url,
          prerelease: release.prerelease,
        }));

      releaseHistory.value = page === 1
        ? mergeReleaseNotes(releases, BUNDLED_RELEASES)
        : sortReleaseNotes([
            ...releaseHistory.value,
            ...releases.filter(
              (release) => !releaseHistory.value.some((item) => item.version === release.version),
            ),
          ]);
      releasePage.value = page;
      hasMoreReleaseNotes.value = payload.length === RELEASE_PAGE_SIZE;
      if (page === 1) writeCachedReleases(releaseHistory.value);

      const latest = releaseHistory.value[0];
      if (latest && latestVersion.value === latest.version) {
        releaseUrl.value = latest.htmlUrl;
        if (!notes.value) notes.value = latest.body;
      }
    } catch (githubError) {
      try {
        window.clearTimeout(timeout);
        controller = new AbortController();
        timeout = window.setTimeout(() => controller.abort(), 15_000);
        const releases = await fetchCnbReleases(page, controller.signal);
        releaseHistory.value = page === 1
          ? mergeReleaseNotes(releases, BUNDLED_RELEASES)
          : sortReleaseNotes([
              ...releaseHistory.value,
              ...releases.filter((release) => !releaseHistory.value.some((item) => item.version === release.version)),
            ]);
        releasePage.value = page;
        hasMoreReleaseNotes.value = releases.length === RELEASE_PAGE_SIZE;
        releaseHistoryUsingFallback.value = true;
        if (page === 1) writeCachedReleases(releaseHistory.value);
      } catch (cnbError) {
        const cache = readCachedReleases();
        if (page === 1) {
          releaseHistory.value = mergeReleaseNotes(cache?.releases ?? [], BUNDLED_RELEASES);
          releasePage.value = 1;
          hasMoreReleaseNotes.value = false;
        }
        const githubMessage = githubError instanceof Error ? githubError.message : String(githubError);
        const cnbMessage = cnbError instanceof Error ? cnbError.message : String(cnbError);
        releaseHistoryError.value = `${githubMessage}; ${cnbMessage}`;
        releaseHistoryUsingFallback.value = releaseHistory.value.length > 0;
      }
    } finally {
      window.clearTimeout(timeout);
      releaseHistoryLoading.value = false;
    }
  };

  const loadMoreReleaseHistory = () => loadReleaseHistory(releasePage.value + 1);
  const refreshReleaseHistory = () => loadReleaseHistory(1, true);
  const cancelUpdate = async () => {
    if (status.value === 'downloading' || status.value === 'ready') return;
    isDialogOpen.value = false;
    status.value = 'idle';
    error.value = null;
    progress.value = 0;
    if (pendingUpdate) {
      await pendingUpdate.close();
      pendingUpdate = null;
    }
  };

  return {
    status,
    currentVersion,
    latestVersion,
    releaseUrl,
    notes,
    publishedAt,
    progress,
    error,
    isDialogOpen,
    releaseHistory,
    releaseHistoryLoading,
    releaseHistoryError,
    releaseHistoryUsingFallback,
    hasMoreReleaseNotes,
    isDesktop,
    isBusy,
    lastUpdateCheckAt,
    hasUpdateAvailable,
    initialize,
    checkForUpdates,
    downloadAndInstall,
    skipVersion,
    openReleasePage,
    loadReleaseHistory,
    loadMoreReleaseHistory,
    refreshReleaseHistory,
    cancelUpdate,
  };
});
