<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings';
import { AI_PROVIDER_PRESETS, useAiStore } from '@/stores/ai';
import type { LlmProvider } from '@/types/ai';
import { useGitApi } from '@/composables/useGitApi';
import { useNotificationStore } from '@/stores/notification';
import { useUpdatesStore } from '@/stores/updates';
import { useRepoStore } from '@/stores/repo';
import { Settings, X, User, Cpu, Info, Globe2, KeyRound, FolderOpen, ShieldCheck, Server, Type } from 'lucide-vue-next';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { SUPPORTED_LOCALES, type Locale } from '@/i18n/config';
import { useI18n } from '@/i18n';
import { computed, ref, watch } from 'vue';
import AboutUpdates from '@/components/settings/AboutUpdates.vue';
import McpSettings from '@/components/settings/McpSettings.vue';
import type { LlmConfig } from '@/types/ai';
import {
  MONO_FONTS,
  UI_FONTS,
  clampFontSize,
  defaultFontIdForLocale,
  ensureFontLoaded,
  getFontById,
  DEFAULT_MONO_FONT_ID,
  type FontGroup,
} from '@/services/fonts';

const settingsStore = useSettingsStore();
const aiStore = useAiStore();
const gitApi = useGitApi();
const notification = useNotificationStore();
const updatesStore = useUpdatesStore();
const repoStore = useRepoStore();
const { t } = useI18n();
const activeTab = ref<'settings' | 'mcp' | 'about'>('settings');
const proxyPassword = ref('');
const draftLanguage = ref<Locale>(settingsStore.language);
const draftProxyMode = ref(settingsStore.proxyMode);
const draftProxyHost = ref(settingsStore.proxyHost);
const draftProxyPort = ref(settingsStore.proxyPort);
const draftProxyAuthEnabled = ref(settingsStore.proxyAuthEnabled);
const draftProxyUsername = ref(settingsStore.proxyUsername);
const draftSshKey = ref(settingsStore.sshKey);
const draftWebToken = ref(settingsStore.webToken);
const draftSshPassphrase = ref('');
const draftAuthorName = ref(settingsStore.authorName);
const draftAuthorEmail = ref(settingsStore.authorEmail);
const draftFontId = ref(settingsStore.fontId);
const draftFontSize = ref(settingsStore.fontSize);
const draftMonoFontId = ref(settingsStore.monoFontId);
const fontLoading = ref(false);
const fontLoadError = ref(false);
const draftProviderId = ref<string>(aiStore.activeProviderId);
const draftLlmConfig = ref<LlmConfig>({ ...aiStore.llmConfig, api_key: '' });
const isCustomProvider = computed(() => draftProviderId.value === 'custom');

function resetDraft() {
  draftLanguage.value = settingsStore.language;
  draftProxyMode.value = settingsStore.proxyMode;
  draftProxyHost.value = settingsStore.proxyHost;
  draftProxyPort.value = settingsStore.proxyPort;
  draftProxyAuthEnabled.value = settingsStore.proxyAuthEnabled;
  draftProxyUsername.value = settingsStore.proxyUsername;
  draftSshKey.value = settingsStore.sshKey;
  draftWebToken.value = settingsStore.webToken;
  draftSshPassphrase.value = '';
  draftAuthorName.value = settingsStore.authorName;
  draftAuthorEmail.value = settingsStore.authorEmail;
  draftFontId.value = settingsStore.fontId;
  draftFontSize.value = settingsStore.fontSize;
  draftMonoFontId.value = settingsStore.monoFontId;
  fontLoadError.value = false;
  fontLoading.value = false;
  draftProviderId.value = aiStore.activeProviderId;
  const currentP = aiStore.providers.find((p) => p.id === aiStore.activeProviderId) || aiStore.activeProvider;
  draftLlmConfig.value = {
    provider: (currentP.protocol as LlmProvider) || 'openai',
    api_base: currentP.api_base,
    model: aiStore.activeModelId || currentP.default_model,
    api_key: '',
    temperature: 0.3,
  };
  proxyPassword.value = '';
}

watch(
  () => settingsStore.isSettingsModalOpen,
  (isOpen) => {
    if (isOpen) {
      resetDraft();
      activeTab.value = 'settings';
      void preloadDraftFonts();
    }
  },
);

const FONT_GROUP_LABELS: Record<FontGroup, string> = {
  latin: 'Latin & European',
  chinese: 'Chinese',
  japanese: 'Japanese',
  arabic: 'Arabic',
  mono: 'Monospace',
};

const FONT_GROUP_ORDER: FontGroup[] = ['latin', 'chinese', 'japanese', 'arabic'];

const uiFontGroups = computed(() =>
  FONT_GROUP_ORDER.map((group) => ({
    key: group,
    label: t(FONT_GROUP_LABELS[group]),
    fonts: UI_FONTS.filter((item) => item.group === group),
  })).filter((group) => group.fonts.length > 0),
);

const draftUiFamily = computed(() => getFontById(draftFontId.value)?.family || 'inherit');
const draftMonoFamily = computed(() => getFontById(draftMonoFontId.value)?.family || 'inherit');
const selectedUiFont = computed(() => getFontById(draftFontId.value));
const selectedMonoFont = computed(() => getFontById(draftMonoFontId.value));

/** Load draft fonts so the preview renders the real webfont before applying. */
let preloadToken = 0;
async function preloadDraftFonts() {
  const token = ++preloadToken;
  fontLoading.value = true;
  fontLoadError.value = false;
  try {
    const [okUi, okMono] = await Promise.all([
      ensureFontLoaded(draftFontId.value),
      ensureFontLoaded(draftMonoFontId.value),
    ]);
    if (token !== preloadToken) return; // A newer selection is already loading.
    if (!okUi || !okMono) fontLoadError.value = true;
  } catch {
    if (token === preloadToken) fontLoadError.value = true;
  } finally {
    if (token === preloadToken) fontLoading.value = false;
  }
}

watch([draftFontId, draftMonoFontId], () => {
  if (settingsStore.isSettingsModalOpen) void preloadDraftFonts();
});

function restoreDefaultFont() {
  draftFontId.value = defaultFontIdForLocale(draftLanguage.value);
  draftFontSize.value = 12;
  draftMonoFontId.value = DEFAULT_MONO_FONT_ID;
}

function stepFontSize(delta: number) {
  draftFontSize.value = clampFontSize(draftFontSize.value + delta);
}

async function saveSettings() {
  if (draftProxyMode.value === 'custom') {
    const port = Number(draftProxyPort.value);
    if (!draftProxyHost.value.trim() || !Number.isInteger(port) || port < 1 || port > 65535) {
      notification.error(t('Invalid proxy settings'), t('Enter a proxy server and a port between 1 and 65535.'));
      return;
    }
  }
  let savedAiCredential = false;
  if (draftLlmConfig.value.api_key) {
    try {
      await gitApi.saveCredential(draftProviderId.value, draftLlmConfig.value.api_key);
      if (draftLlmConfig.value.provider && draftLlmConfig.value.provider !== draftProviderId.value) {
        await gitApi.saveCredential(draftLlmConfig.value.provider, draftLlmConfig.value.api_key).catch(() => undefined);
      }
      savedAiCredential = true;
      notification.success(t('Settings Saved'), t('The AI credential was stored in the system keyring.'));
    } catch (error: any) {
      notification.warning(t('Settings Saved'), error?.message || t('The key remains in memory only.'));
    }
  }
  if (draftProxyAuthEnabled.value && proxyPassword.value && gitApi.isTauri()) {
    try {
      await gitApi.saveCredential('proxy', proxyPassword.value);
      proxyPassword.value = '';
    } catch (error: any) {
      notification.warning(t('Settings Saved'), error?.message || t('The proxy password remains in memory only.'));
    }
  }
  try {
    let normalizedSshKey = draftSshKey.value.trim();
    if (normalizedSshKey && draftSshPassphrase.value) {
      normalizedSshKey = await gitApi.saveSshPassphrase(normalizedSshKey, draftSshPassphrase.value);
      draftSshPassphrase.value = '';
    }
    settingsStore.proxyMode = draftProxyMode.value;
    settingsStore.proxyHost = draftProxyHost.value;
    settingsStore.proxyPort = Number(draftProxyPort.value);
    settingsStore.proxyAuthEnabled = draftProxyAuthEnabled.value;
    settingsStore.proxyUsername = draftProxyUsername.value;
    settingsStore.sshKey = normalizedSshKey;
    settingsStore.webToken = draftWebToken.value.trim();
    settingsStore.authorName = draftAuthorName.value;
    settingsStore.authorEmail = draftAuthorEmail.value;
    settingsStore.changeLanguage(draftLanguage.value);
    settingsStore.fontId = draftFontId.value;
    settingsStore.fontSize = clampFontSize(draftFontSize.value);
    settingsStore.monoFontId = draftMonoFontId.value;
    await settingsStore.applyFont();

    // Update target provider's api_base and default_model in aiStore
    const targetProvider = aiStore.providers.find((item) => item.id === draftProviderId.value);
    if (targetProvider) {
      targetProvider.api_base = draftLlmConfig.value.api_base;
      targetProvider.default_model = draftLlmConfig.value.model;
      if (draftLlmConfig.value.api_key && !savedAiCredential) {
        targetProvider.api_key = draftLlmConfig.value.api_key;
      }
      await aiStore.saveProvider(targetProvider);
    }

    // Synchronously update active provider and active model on aiStore
    aiStore.setProvider(draftProviderId.value);
    aiStore.setModel(draftLlmConfig.value.model);

    Object.assign(aiStore.llmConfig, {
      provider: draftLlmConfig.value.provider,
      api_base: draftLlmConfig.value.api_base,
      model: draftLlmConfig.value.model,
      api_key: savedAiCredential ? '' : draftLlmConfig.value.api_key,
    });
    await aiStore.persistConfig();
    await settingsStore.persistSettings();
    if (!gitApi.isTauri() && repoStore.activeRepoPath) {
      const loaded = await repoStore.loadRepo();
      if (!loaded) {
        notification.error(t('Failed to save settings'), repoStore.errorMessage || t('Authentication required'));
        return;
      }
    }
    notification.success(t('Settings Saved'), t('Configuration was saved to the user directory.'));
    settingsStore.closeSettingsModal();
  } catch (error: any) {
    notification.error(t('Failed to save settings'), error?.message || String(error));
  }
}

async function selectGlobalSshKey() {
  const selected = await openDialog({
    multiple: false,
    directory: false,
    title: t('Select SSH Private Key'),
  });
  if (typeof selected === 'string') draftSshKey.value = selected;
}

function handleProviderChange(event: Event) {
  const providerId = (event.target as HTMLSelectElement).value;
  draftProviderId.value = providerId;
  draftLlmConfig.value.api_key = '';

  const matched = aiStore.providers.find((item) => item.id === providerId);
  if (matched) {
    draftLlmConfig.value.provider = (matched.protocol as LlmProvider) || 'openai';
    draftLlmConfig.value.api_base = matched.api_base;
    draftLlmConfig.value.model = matched.default_model;
  } else if (providerId === 'custom') {
    draftLlmConfig.value.provider = 'custom';
    draftLlmConfig.value.api_base = '';
    draftLlmConfig.value.model = '';
  }
}

function providerModels() {
  if (draftProviderId.value === 'custom') return [];
  const pId = draftProviderId.value;
  if (aiStore.cachedModels[pId] && aiStore.cachedModels[pId].length > 0) {
    return aiStore.cachedModels[pId].map((m) => m.id);
  }
  const preset = (AI_PROVIDER_PRESETS as any)[pId];
  if (preset && Array.isArray(preset.models)) {
    return preset.models;
  }
  const matched = aiStore.providers.find((p) => p.id === pId);
  return matched?.default_model ? [matched.default_model] : [];
}

function closeSettings() {
  resetDraft();
  settingsStore.closeSettingsModal();
}
</script>

<template>
  <div
    v-if="settingsStore.isSettingsModalOpen"
    @click.self="closeSettings"
    @keydown.esc.window="closeSettings"
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
  >
    <div
      role="dialog"
      aria-modal="true"
      :aria-label="t('GITBX Settings')"
      class="w-full max-w-3xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs"
      @click.stop
    >
      <!-- Modal Header -->
      <div class="h-11 bg-muted/50 px-4 flex items-center justify-between border-b border-border select-none">
        <div class="flex items-center space-x-2">
          <Settings class="w-4 h-4 text-primary" aria-hidden="true" />
          <span class="font-bold text-sm text-foreground">{{ t('GITBX Settings') }}</span>
        </div>
        <button
          type="button"
          aria-label="Close dialog"
          @click="closeSettings"
          class="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition focus:outline-none focus:ring-1 focus:ring-foreground/50"
        >
          <X class="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div class="flex border-b border-border bg-muted/20 px-4">
        <button
          class="inline-flex items-center gap-1.5 border-b-2 px-3 py-2 transition"
          :class="activeTab === 'settings' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'settings'"
        >
          <Settings class="h-3.5 w-3.5" />
          {{ t('Settings') }}
        </button>
        <button
          class="inline-flex items-center gap-1.5 border-b-2 px-3 py-2 transition"
          :class="activeTab === 'mcp' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'mcp'"
        >
          <Server class="h-3.5 w-3.5" />
          MCP 授权与接入
        </button>
        <button
          class="relative inline-flex items-center gap-1.5 border-b-2 px-3 py-2 transition"
          :class="activeTab === 'about' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'about'"
        >
          <Info class="h-3.5 w-3.5" />
          {{ t('About GITBX') }}
          <span
            v-if="updatesStore.hasUpdateAvailable"
            class="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-card"
            :title="t('New version available')"
            aria-label="New version available"
          />
        </button>
      </div>

      <!-- Settings Body -->
      <div v-show="activeTab === 'settings'" class="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
        <div class="space-y-2">
          <div class="flex items-center space-x-1.5 font-semibold text-foreground">
            <span>{{ t('Language') }}</span>
          </div>
          <select
            v-model="draftLanguage"
            class="w-full bg-background border border-border rounded px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option v-for="item in SUPPORTED_LOCALES" :key="item.code" :value="item.code">
              {{ item.nativeLabel }} · {{ item.label }}
            </option>
          </select>
        </div>

        <!-- Font -->
        <div class="space-y-2 border-t border-border pt-3">
          <div class="flex items-center space-x-1.5 font-semibold text-foreground">
            <Type class="h-3.5 w-3.5 text-amber-400" />
            <span>{{ t('Font') }}</span>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-[11px] text-muted-foreground">{{ t('Interface Font') }}</label>
              <select
                v-model="draftFontId"
                data-testid="settings-font-select"
                class="w-full bg-background border border-border rounded px-2.5 py-1.5 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <optgroup v-for="group in uiFontGroups" :key="group.key" :label="group.label">
                  <option v-for="font in group.fonts" :key="font.id" :value="font.id">
                    {{ font.label }}
                  </option>
                </optgroup>
              </select>
            </div>
            <div>
              <label class="text-[11px] text-muted-foreground">{{ t('Code Font') }}</label>
              <select
                v-model="draftMonoFontId"
                data-testid="settings-mono-font-select"
                class="w-full bg-background border border-border rounded px-2.5 py-1.5 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option v-for="font in MONO_FONTS" :key="font.id" :value="font.id">
                  {{ font.label }}
                </option>
              </select>
            </div>
          </div>
          <p class="text-[10px] text-muted-foreground">
            {{ selectedUiFont?.label }} · {{ selectedUiFont?.license }} / {{ selectedMonoFont?.label }} · {{ selectedMonoFont?.license }}
          </p>

          <div>
            <div class="flex items-center justify-between">
              <label class="text-[11px] text-muted-foreground">{{ t('Font Size') }}</label>
              <div class="flex items-center gap-1.5">
                <button
                  type="button"
                  data-testid="settings-font-decrease"
                  @click="stepFontSize(-1)"
                  class="w-6 h-6 rounded border border-border hover:bg-accent text-foreground"
                >
                  −
                </button>
                <span data-testid="settings-font-size-value" class="w-12 text-center font-mono">{{ draftFontSize }}px</span>
                <button
                  type="button"
                  data-testid="settings-font-increase"
                  @click="stepFontSize(1)"
                  class="w-6 h-6 rounded border border-border hover:bg-accent text-foreground"
                >
                  +
                </button>
                <button
                  type="button"
                  @click="restoreDefaultFont"
                  class="rounded px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  {{ t('Restore Default') }}
                </button>
              </div>
            </div>
            <input
              v-model.number="draftFontSize"
              type="range"
              min="11"
              max="20"
              step="1"
              data-testid="settings-font-size"
              class="w-full mt-1 accent-[hsl(var(--primary))]"
            />
          </div>

          <div>
            <label class="text-[11px] text-muted-foreground">{{ t('Font Preview') }}</label>
            <div
              data-testid="settings-font-preview"
              class="rounded border border-border bg-background p-2.5 mt-1 space-y-1 overflow-hidden"
              :style="{ fontFamily: draftUiFamily, fontSize: draftFontSize + 'px' }"
            >
              <p class="font-semibold">Agile Git 0123456789 AaBbCcDdEe</p>
              <p>简体中文：思源宋体 · 阿里巴巴普惠体 · 鸿蒙 HarmonyOS Sans</p>
              <p>繁體中文測試 · 日本語テスト · العربية اختبار · Ää Öö Üü ß Éè</p>
              <p class="opacity-80" :style="{ fontFamily: draftMonoFamily }">
                const diff = await loadFont("Noto Serif SC"); // 0123456789
              </p>
              <p v-if="fontLoading" class="text-muted-foreground">{{ t('Loading font...') }}</p>
              <p v-if="fontLoadError && !fontLoading" class="text-amber-500">
                {{ t('Font failed to load, using system fallback.') }}
              </p>
            </div>
            <p class="text-[10px] text-muted-foreground mt-1">
              {{ t('Online fonts load on demand; offline falls back to system fonts.') }}
            </p>
            <p class="text-[10px] text-muted-foreground">
              {{ t('Font applies to the whole app after saving.') }}
            </p>
          </div>
        </div>

        <!-- Web authentication -->
        <div v-if="!gitApi.isTauri()" class="space-y-2 border-t border-border pt-3">
          <div class="flex items-center space-x-1.5 font-semibold text-foreground">
            <ShieldCheck class="h-3.5 w-3.5 text-emerald-400" />
            <span>{{ t('Web API Token') }}</span>
          </div>
          <input
            v-model="draftWebToken"
            type="password"
            autocomplete="current-password"
            :placeholder="t('Enter the token configured by GITBX_WEB_TOKEN')"
            class="w-full rounded border border-border bg-background px-2.5 py-1.5 font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <p class="text-[10px] text-muted-foreground">
            {{ t('Stored only in this browser and sent to the local GITBX Web API.') }}
          </p>
        </div>

        <!-- Network Proxy -->
        <div class="space-y-2 border-t border-border pt-3">
          <div class="flex items-center space-x-1.5 font-semibold text-foreground">
            <Globe2 class="w-3.5 h-3.5 text-sky-400" />
            <span>{{ t('Proxy Server') }}</span>
          </div>
          <div class="space-y-1.5 text-muted-foreground">
            <label class="flex items-center gap-2 cursor-pointer">
              <input v-model="draftProxyMode" type="radio" value="system" />
              <span>{{ t('Use system proxy settings') }}</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input v-model="draftProxyMode" type="radio" value="custom" />
              <span>{{ t('Use custom proxy') }}</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input v-model="draftProxyMode" type="radio" value="none" />
              <span>{{ t('Do not use a proxy') }}</span>
            </label>
          </div>
          <div v-if="draftProxyMode === 'custom'" class="space-y-2 rounded border border-border bg-background/50 p-2">
            <div class="grid grid-cols-[1fr_7rem] gap-2">
              <div>
                <label class="text-[11px] text-muted-foreground">{{ t('Proxy server') }}</label>
                <input
                  v-model="draftProxyHost"
                  placeholder="127.0.0.1"
                  class="w-full bg-background border border-border rounded px-2.5 py-1.5 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label class="text-[11px] text-muted-foreground">{{ t('Port') }}</label>
                <input
                  v-model.number="draftProxyPort"
                  type="number"
                  min="1"
                  max="65535"
                  placeholder="8080"
                  class="w-full bg-background border border-border rounded px-2.5 py-1.5 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <label class="flex items-center gap-2 text-muted-foreground cursor-pointer">
              <input v-model="draftProxyAuthEnabled" type="checkbox" />
              <span>{{ t('Proxy requires authentication') }}</span>
            </label>
            <div v-if="draftProxyAuthEnabled" class="grid grid-cols-2 gap-2">
              <div>
                <label class="text-[11px] text-muted-foreground">{{ t('Username') }}</label>
                <input
                  v-model="draftProxyUsername"
                  class="w-full bg-background border border-border rounded px-2.5 py-1.5 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label class="text-[11px] text-muted-foreground">{{ t('Password') }}</label>
                <input
                  v-model="proxyPassword"
                  type="password"
                  :placeholder="t('Leave blank to keep saved password')"
                  class="w-full bg-background border border-border rounded px-2.5 py-1.5 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <p class="text-[10px] text-muted-foreground">
              {{ t('Proxy settings apply to HTTP(S) Git operations. SSH remotes are not proxied.') }}
            </p>
          </div>
        </div>

        <!-- Global SSH identity -->
        <div class="space-y-2 border-t border-border pt-3">
          <div class="flex items-center space-x-1.5 font-semibold text-foreground">
            <KeyRound class="w-3.5 h-3.5 text-emerald-400" />
            <span>{{ t('Global SSH Key') }}</span>
          </div>
          <div class="flex items-center gap-2">
            <input
              v-model="draftSshKey"
              :placeholder="t('Use SSH agent or Git credentials when empty')"
              class="min-w-0 flex-1 bg-background border border-border rounded px-2.5 py-1.5 text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button type="button" class="inline-flex items-center gap-1 rounded border border-border px-2.5 py-1.5 hover:bg-accent" @click="selectGlobalSshKey">
              <FolderOpen class="h-3.5 w-3.5" />{{ t('Browse') }}
            </button>
            <button v-if="draftSshKey" type="button" class="rounded px-2.5 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" @click="draftSshKey = ''">
              {{ t('Clear') }}
            </button>
          </div>
          <div v-if="draftSshKey">
            <label class="text-[11px] text-muted-foreground">{{ t('SSH Key Passphrase') }}</label>
            <input
              v-model="draftSshPassphrase"
              type="password"
              :placeholder="t('Leave blank to keep the saved passphrase')"
              autocomplete="new-password"
              class="mt-1 w-full rounded border border-border bg-background px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <p class="text-[10px] text-muted-foreground">
            {{ t('Used for SSH remotes unless the current repository has its own key.') }}
          </p>
        </div>

        <!-- Git Signature -->
        <div class="space-y-2">
          <div class="flex items-center space-x-1.5 font-semibold text-foreground">
            <User class="w-3.5 h-3.5 text-blue-400" />
            <span>{{ t('Git User Signature') }}</span>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-[11px] text-muted-foreground">{{ t('Author Name') }}</label>
              <input
                v-model="draftAuthorName"
                class="w-full bg-background border border-border rounded px-2.5 py-1.5 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label class="text-[11px] text-muted-foreground">{{ t('Author Email') }}</label>
              <input
                v-model="draftAuthorEmail"
                class="w-full bg-background border border-border rounded px-2.5 py-1.5 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        <!-- AI Provider Configuration -->
        <div class="space-y-2 border-t border-border pt-3">
          <div class="flex items-center space-x-1.5 font-semibold text-foreground">
            <Cpu class="w-3.5 h-3.5 text-purple-400" />
            <span>{{ t('AI Copilot & LLM Provider') }}</span>
          </div>
          <div :key="draftProviderId" class="space-y-2">
            <div>
              <label class="text-[11px] text-muted-foreground">{{ t('Provider') }}</label>
              <select
                data-testid="settings-provider-select"
                :value="draftProviderId"
                @change="handleProviderChange"
                class="w-full bg-background border border-border rounded px-2.5 py-1.5 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <optgroup :label="t('Built-in Support')">
                  <option
                    v-for="p in aiStore.providers.filter((x) => x.category === 'builtin')"
                    :key="p.id"
                    :value="p.id"
                  >
                    {{ p.name }}
                  </option>
                </optgroup>
                <optgroup :label="t('CLI Agents')">
                  <option
                    v-for="p in aiStore.providers.filter((x) => x.category === 'cli')"
                    :key="p.id"
                    :value="p.id"
                  >
                    {{ p.name }}
                  </option>
                </optgroup>
              </select>
            </div>
            <div>
              <label class="text-[11px] text-muted-foreground">{{ t('Model') }}</label>
              <select
                v-if="!isCustomProvider"
                v-model="draftLlmConfig.model"
                class="w-full bg-background border border-border rounded px-2.5 py-1.5 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option v-for="model in providerModels()" :key="model" :value="model">{{ model }}</option>
              </select>
              <input
                v-else
                v-model="draftLlmConfig.model"
                placeholder="Model ID"
                class="w-full bg-background border border-border rounded px-2.5 py-1.5 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label class="text-[11px] text-muted-foreground">{{ t('API Base URL') }}</label>
              <input
                v-model="draftLlmConfig.api_base"
                :placeholder="isCustomProvider ? 'https://api.example.com/v1' : undefined"
                class="w-full bg-background border border-border rounded px-2.5 py-1.5 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p v-if="isCustomProvider" class="mt-1 text-[10px] text-muted-foreground">
                OpenAI-compatible APIs usually require the /v1 path prefix.
              </p>
            </div>
            <div>
              <label class="text-[11px] text-muted-foreground">{{ t('API Key') }}</label>
              <input
                v-model="draftLlmConfig.api_key"
                type="password"
                placeholder="sk-..."
                class="w-full bg-background border border-border rounded px-2.5 py-1.5 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </div>
      </div>

      <div v-show="activeTab === 'mcp'" class="p-4 max-h-[70vh] overflow-y-auto">
        <McpSettings />
      </div>

      <div v-if="activeTab === 'about'" class="max-h-[70vh] overflow-y-auto p-4">
        <AboutUpdates />
      </div>

      <!-- Footer -->
      <div class="h-11 bg-muted/30 px-4 flex items-center justify-end border-t border-border">
        <button
          data-testid="settings-save-btn"
          @click="activeTab === 'settings' ? saveSettings() : closeSettings()"
          class="px-4 py-1.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition"
        >
          {{ activeTab === 'settings' ? t('Save & Close') : t('Close') }}
        </button>
      </div>
    </div>
  </div>
</template>
