<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings';
import { AI_PROVIDER_PRESETS, useAiStore } from '@/stores/ai';
import type { LlmProvider } from '@/types/ai';
import { useGitApi } from '@/composables/useGitApi';
import { useNotificationStore } from '@/stores/notification';
import { useUpdatesStore } from '@/stores/updates';
import { useRepoStore } from '@/stores/repo';
import { Settings, User, Cpu, Info, Globe2, KeyRound, FolderOpen, ShieldCheck, Server, Type } from 'lucide-vue-next';
import ArcoModal from '@/components/ui/ArcoModal.vue';
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
  <ArcoModal
    v-if="settingsStore.isSettingsModalOpen"
    :title="t('GITBX Settings')"
    max-width-class="max-w-3xl"
    height-class="max-h-[85vh]"
    close-on-backdrop
    raw-body
    @close="closeSettings"
  >
    <template #icon>
      <Settings class="w-4 h-4" aria-hidden="true" />
    </template>

    <template #below-header>
      <div class="arco-tabs bg-[hsl(var(--arco-fill-1))] shrink-0">
        <button
          type="button"
          class="arco-tab"
          :class="{ 'arco-tab-active': activeTab === 'settings' }"
          @click="activeTab = 'settings'"
        >
          <Settings class="h-3.5 w-3.5" />
          {{ t('Settings') }}
        </button>
        <button
          type="button"
          class="arco-tab"
          :class="{ 'arco-tab-active': activeTab === 'mcp' }"
          @click="activeTab = 'mcp'"
        >
          <Server class="h-3.5 w-3.5" />
          MCP 授权与接入
        </button>
        <button
          type="button"
          class="arco-tab relative"
          :class="{ 'arco-tab-active': activeTab === 'about' }"
          @click="activeTab = 'about'"
        >
          <Info class="h-3.5 w-3.5" />
          {{ t('About GITBX') }}
          <span
            v-if="updatesStore.hasUpdateAvailable"
            class="ml-0.5 h-2 w-2 rounded-full bg-[hsl(var(--arco-danger))]"
            :title="t('New version available')"
            aria-label="New version available"
          />
        </button>
      </div>
    </template>

    <!-- Settings Body -->
    <div v-show="activeTab === 'settings'" class="flex-1 overflow-y-auto p-5 space-y-4">
      <div class="rounded-[8px] border border-border/80 bg-[hsl(var(--arco-fill-1))] p-3.5 space-y-2.5">
        <div class="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
          <span>{{ t('Language') }}</span>
        </div>
        <select v-model="draftLanguage" class="arco-select">
          <option v-for="item in SUPPORTED_LOCALES" :key="item.code" :value="item.code">
            {{ item.nativeLabel }} · {{ item.label }}
          </option>
        </select>
      </div>

      <!-- Font -->
      <div class="rounded-[8px] border border-border/80 bg-[hsl(var(--arco-fill-1))] p-3.5 space-y-3">
        <div class="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
          <Type class="h-3.5 w-3.5 text-[hsl(var(--arco-warning))]" />
          <span>{{ t('Font') }}</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="text-[11px] font-medium text-muted-foreground">{{ t('Interface Font') }}</label>
            <select
              v-model="draftFontId"
              data-testid="settings-font-select"
              class="arco-select mt-1"
            >
              <optgroup v-for="group in uiFontGroups" :key="group.key" :label="group.label">
                <option v-for="font in group.fonts" :key="font.id" :value="font.id">
                  {{ font.label }}
                </option>
              </optgroup>
            </select>
          </div>
          <div>
            <label class="text-[11px] font-medium text-muted-foreground">{{ t('Code Font') }}</label>
            <select
              v-model="draftMonoFontId"
              data-testid="settings-mono-font-select"
              class="arco-select mt-1"
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

        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <label class="text-[11px] font-medium text-muted-foreground">{{ t('Font Size') }}</label>
            <div class="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="settings-font-decrease"
                @click="stepFontSize(-1)"
                class="arco-icon-btn h-6 w-6 border border-border bg-card font-semibold text-foreground"
              >
                −
              </button>
              <span data-testid="settings-font-size-value" class="w-12 text-center font-mono text-[11px] font-medium tabular-nums">{{ draftFontSize }}px</span>
              <button
                type="button"
                data-testid="settings-font-increase"
                @click="stepFontSize(1)"
                class="arco-icon-btn h-6 w-6 border border-border bg-card font-semibold text-foreground"
              >
                +
              </button>
              <button
                type="button"
                @click="restoreDefaultFont"
                class="arco-btn arco-btn-text arco-btn-sm"
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
            class="w-full accent-[hsl(var(--primary))]"
          />
        </div>

        <div>
          <label class="text-[11px] font-medium text-muted-foreground">{{ t('Font Preview') }}</label>
          <div
            data-testid="settings-font-preview"
            class="rounded-[6px] border border-border/80 bg-card p-3 mt-1 space-y-1 overflow-hidden"
            :style="{ fontFamily: draftUiFamily, fontSize: draftFontSize + 'px' }"
          >
            <p class="font-semibold">Agile Git 0123456789 AaBbCcDdEe</p>
            <p>简体中文：思源宋体 · 阿里巴巴普惠体 · 鸿蒙 HarmonyOS Sans</p>
            <p>繁體中文測試 · 日本語テスト · العربية اختبار · Ää Öö Üü ß Éè</p>
            <p class="opacity-80" :style="{ fontFamily: draftMonoFamily }">
              const diff = await loadFont("Noto Serif SC"); // 0123456789
            </p>
            <p v-if="fontLoading" class="text-muted-foreground">{{ t('Loading font...') }}</p>
            <p v-if="fontLoadError && !fontLoading" class="text-[hsl(var(--arco-warning))]">
              {{ t('Font failed to load, using system fallback.') }}
            </p>
          </div>
          <p class="text-[10px] text-muted-foreground mt-1.5">
            {{ t('Online fonts load on demand; offline falls back to system fonts.') }}
          </p>
          <p class="text-[10px] text-muted-foreground">
            {{ t('Font applies to the whole app after saving.') }}
          </p>
        </div>
      </div>

      <!-- Web authentication -->
      <div v-if="!gitApi.isTauri()" class="rounded-[8px] border border-border/80 bg-[hsl(var(--arco-fill-1))] p-3.5 space-y-2">
        <div class="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
          <ShieldCheck class="h-3.5 w-3.5 text-[hsl(var(--arco-success))]" />
          <span>{{ t('Web API Token') }}</span>
        </div>
        <input
          v-model="draftWebToken"
          type="password"
          autocomplete="current-password"
          :placeholder="t('Enter the token configured by GITBX_WEB_TOKEN')"
          class="arco-input font-mono"
        />
        <p class="text-[10px] text-muted-foreground">
          {{ t('Stored only in this browser and sent to the local GITBX Web API.') }}
        </p>
      </div>

      <!-- Network Proxy -->
      <div class="rounded-[8px] border border-border/80 bg-[hsl(var(--arco-fill-1))] p-3.5 space-y-2.5">
        <div class="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
          <Globe2 class="w-3.5 h-3.5 text-primary" />
          <span>{{ t('Proxy Server') }}</span>
        </div>
        <div class="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-5 text-muted-foreground">
          <label class="flex items-center gap-2 cursor-pointer text-foreground/90">
            <input v-model="draftProxyMode" type="radio" value="system" class="accent-[hsl(var(--primary))]" />
            <span>{{ t('Use system proxy settings') }}</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer text-foreground/90">
            <input v-model="draftProxyMode" type="radio" value="custom" class="accent-[hsl(var(--primary))]" />
            <span>{{ t('Use custom proxy') }}</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer text-foreground/90">
            <input v-model="draftProxyMode" type="radio" value="none" class="accent-[hsl(var(--primary))]" />
            <span>{{ t('Do not use a proxy') }}</span>
          </label>
        </div>
        <div v-if="draftProxyMode === 'custom'" class="space-y-2.5 rounded-[6px] border border-border/80 bg-card p-3">
          <div class="grid grid-cols-[1fr_7rem] gap-2.5">
            <div>
              <label class="text-[11px] font-medium text-muted-foreground">{{ t('Proxy server') }}</label>
              <input
                v-model="draftProxyHost"
                placeholder="127.0.0.1"
                class="arco-input mt-1"
              />
            </div>
            <div>
              <label class="text-[11px] font-medium text-muted-foreground">{{ t('Port') }}</label>
              <input
                v-model.number="draftProxyPort"
                type="number"
                min="1"
                max="65535"
                placeholder="8080"
                class="arco-input mt-1"
              />
            </div>
          </div>
          <label class="flex items-center gap-2 text-muted-foreground cursor-pointer">
            <input v-model="draftProxyAuthEnabled" type="checkbox" class="accent-[hsl(var(--primary))]" />
            <span class="text-foreground/90">{{ t('Proxy requires authentication') }}</span>
          </label>
          <div v-if="draftProxyAuthEnabled" class="grid grid-cols-2 gap-2.5">
            <div>
              <label class="text-[11px] font-medium text-muted-foreground">{{ t('Username') }}</label>
              <input v-model="draftProxyUsername" class="arco-input mt-1" />
            </div>
            <div>
              <label class="text-[11px] font-medium text-muted-foreground">{{ t('Password') }}</label>
              <input
                v-model="proxyPassword"
                type="password"
                :placeholder="t('Leave blank to keep saved password')"
                class="arco-input mt-1"
              />
            </div>
          </div>
          <p class="text-[10px] text-muted-foreground">
            {{ t('Proxy settings apply to HTTP(S) Git operations. SSH remotes are not proxied.') }}
          </p>
        </div>
      </div>

      <!-- Global SSH identity -->
      <div class="rounded-[8px] border border-border/80 bg-[hsl(var(--arco-fill-1))] p-3.5 space-y-2.5">
        <div class="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
          <KeyRound class="w-3.5 h-3.5 text-[hsl(var(--arco-success))]" />
          <span>{{ t('Global SSH Key') }}</span>
        </div>
        <div class="flex items-center gap-2">
          <input
            v-model="draftSshKey"
            :placeholder="t('Use SSH agent or Git credentials when empty')"
            class="arco-input min-w-0 flex-1 font-mono"
          />
          <button type="button" class="arco-btn arco-btn-outline" @click="selectGlobalSshKey">
            <FolderOpen class="h-3.5 w-3.5" />{{ t('Browse') }}
          </button>
          <button v-if="draftSshKey" type="button" class="arco-btn arco-btn-text" @click="draftSshKey = ''">
            {{ t('Clear') }}
          </button>
        </div>
        <div v-if="draftSshKey">
          <label class="text-[11px] font-medium text-muted-foreground">{{ t('SSH Key Passphrase') }}</label>
          <input
            v-model="draftSshPassphrase"
            type="password"
            :placeholder="t('Leave blank to keep the saved passphrase')"
            autocomplete="new-password"
            class="arco-input mt-1"
          />
        </div>
        <p class="text-[10px] text-muted-foreground">
          {{ t('Used for SSH remotes unless the current repository has its own key.') }}
        </p>
      </div>

      <!-- Git Signature -->
      <div class="rounded-[8px] border border-border/80 bg-[hsl(var(--arco-fill-1))] p-3.5 space-y-2.5">
        <div class="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
          <User class="w-3.5 h-3.5 text-primary" />
          <span>{{ t('Git User Signature') }}</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="text-[11px] font-medium text-muted-foreground">{{ t('Author Name') }}</label>
            <input v-model="draftAuthorName" class="arco-input mt-1" />
          </div>
          <div>
            <label class="text-[11px] font-medium text-muted-foreground">{{ t('Author Email') }}</label>
            <input v-model="draftAuthorEmail" class="arco-input mt-1" />
          </div>
        </div>
      </div>

      <!-- AI Provider Configuration -->
      <div class="rounded-[8px] border border-border/80 bg-[hsl(var(--arco-fill-1))] p-3.5 space-y-2.5">
        <div class="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
          <Cpu class="w-3.5 h-3.5 text-purple-500" />
          <span>{{ t('AI Copilot & LLM Provider') }}</span>
        </div>
        <div :key="draftProviderId" class="space-y-2.5">
          <div>
            <label class="text-[11px] font-medium text-muted-foreground">{{ t('Provider') }}</label>
            <select
              data-testid="settings-provider-select"
              :value="draftProviderId"
              @change="handleProviderChange"
              class="arco-select mt-1"
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
            <label class="text-[11px] font-medium text-muted-foreground">{{ t('Model') }}</label>
            <select
              v-if="!isCustomProvider"
              v-model="draftLlmConfig.model"
              class="arco-select mt-1"
            >
              <option v-for="model in providerModels()" :key="model" :value="model">{{ model }}</option>
            </select>
            <input
              v-else
              v-model="draftLlmConfig.model"
              placeholder="Model ID"
              class="arco-input mt-1"
            />
          </div>
          <div>
            <label class="text-[11px] font-medium text-muted-foreground">{{ t('API Base URL') }}</label>
            <input
              v-model="draftLlmConfig.api_base"
              :placeholder="isCustomProvider ? 'https://api.example.com/v1' : undefined"
              class="arco-input mt-1"
            />
            <p v-if="isCustomProvider" class="mt-1 text-[10px] text-muted-foreground">
              OpenAI-compatible APIs usually require the /v1 path prefix.
            </p>
          </div>
          <div>
            <label class="text-[11px] font-medium text-muted-foreground">{{ t('API Key') }}</label>
            <input
              v-model="draftLlmConfig.api_key"
              type="password"
              placeholder="sk-..."
              class="arco-input mt-1"
            />
          </div>
        </div>
      </div>
    </div>

    <div v-show="activeTab === 'mcp'" class="flex-1 overflow-y-auto p-5">
      <McpSettings />
    </div>

    <div v-if="activeTab === 'about'" class="flex-1 overflow-y-auto p-5">
      <AboutUpdates />
    </div>

    <template #footer>
      <button
        type="button"
        data-testid="settings-save-btn"
        @click="activeTab === 'settings' ? saveSettings() : closeSettings()"
        class="arco-btn arco-btn-primary"
      >
        {{ activeTab === 'settings' ? t('Save & Close') : t('Close') }}
      </button>
    </template>
  </ArcoModal>
</template>
