<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useAiStore } from '@/stores/ai';
import { useSettingsStore } from '@/stores/settings';
import { useI18n } from '@/i18n';
import {
  Search,
  RefreshCw,
  Check,
  Cpu,
  Settings,
  X,
  Terminal,
} from 'lucide-vue-next';
import ProviderIcon from './ProviderIcon.vue';
import type { AiProviderConfig, AiModelItem } from '@/types/ai';

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const aiStore = useAiStore();
const settingsStore = useSettingsStore();
const { t } = useI18n();

const searchQuery = ref('');
const customModelInput = ref('');
const selectedProviderId = ref<string>(aiStore.activeProviderId);

watch(
  () => aiStore.activeProviderId,
  (newId) => {
    selectedProviderId.value = newId;
  },
  { immediate: true },
);

const builtinProviders = computed(() => {
  return aiStore.providers.filter((p) => p.category === 'builtin');
});

const cliProviders = computed(() => {
  return aiStore.providers.filter((p) => p.category === 'cli');
});

const currentProvider = computed<AiProviderConfig>(() => {
  return (
    aiStore.providers.find((p) => p.id === selectedProviderId.value) ||
    aiStore.providers[0]
  );
});

const isFetching = computed(() => {
  return Boolean(aiStore.isFetchingModels[selectedProviderId.value]);
});

const fetchError = computed(() => {
  return aiStore.fetchModelsError[selectedProviderId.value];
});

// Filtered models for selected provider
const displayedModels = computed<AiModelItem[]>(() => {
  const pId = selectedProviderId.value;
  let models: AiModelItem[] = [];

  if (aiStore.cachedModels[pId] && aiStore.cachedModels[pId].length > 0) {
    models = aiStore.cachedModels[pId];
  } else {
    const preset = (aiStore as any).AI_PROVIDER_PRESETS?.[pId];
    if (preset && Array.isArray(preset.models)) {
      models = preset.models.map((m: string) => ({
        id: m,
        name: m,
        provider_id: pId,
      }));
    } else if (currentProvider.value.default_model) {
      models = [
        {
          id: currentProvider.value.default_model,
          name: currentProvider.value.default_model,
          provider_id: pId,
        },
      ];
    }
  }

  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return models;

  return models.filter(
    (m) =>
      m.id.toLowerCase().includes(query) ||
      m.name.toLowerCase().includes(query) ||
      (m.description && m.description.toLowerCase().includes(query)),
  );
});

function handleSelectProvider(providerId: string) {
  selectedProviderId.value = providerId;
}

function handleSelectModel(modelId: string) {
  aiStore.setProvider(selectedProviderId.value);
  aiStore.setModel(modelId);
  emit('close');
}

function handleApplyCustomModel() {
  const trimmed = customModelInput.value.trim();
  if (!trimmed) return;
  aiStore.setProvider(selectedProviderId.value);
  aiStore.setModel(trimmed);
  customModelInput.value = '';
  emit('close');
}

async function handleRefreshModels() {
  await aiStore.fetchModels(selectedProviderId.value, true);
}

function openSettings() {
  emit('close');
  settingsStore.openSettingsModal();
}
</script>

<template>
  <Teleport to="body">
    <div
      data-testid="model-selector-popover"
      class="fixed arco-modal-backdrop z-[100] select-none"
      @click.self="emit('close')"
      @keydown.esc.window="emit('close')"
    >
      <div
        role="dialog"
        aria-modal="true"
        :aria-label="t('Select AI Model & Provider')"
        class="arco-modal max-w-3xl max-h-[85vh] select-text"
        @click.stop
      >
      <!-- Popover Header -->
      <div class="px-5 py-3 border-b border-border/80 flex items-center justify-between bg-card/60 shrink-0">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="arco-modal-icon">
            <Cpu class="w-4 h-4" />
          </div>
          <div class="min-w-0">
            <h3 class="arco-modal-title">{{ t('Select AI Model & Provider') }}</h3>
            <p class="text-[11px] text-muted-foreground truncate">{{ t('Choose provider and model for chat, code review, and git operations') }}</p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close dialog"
          @click="emit('close')"
          class="arco-modal-close"
        >
          <X class="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <!-- Search Input Bar -->
      <div class="px-4 py-2.5 border-b border-border bg-card/30 shrink-0">
        <div class="relative">
          <Search class="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="t('Search models, providers, or enter keywords...')"
            class="arco-input pl-9 pr-3"
            autofocus
          />
        </div>
      </div>

      <!-- Main Body: 2-Column (Left: Providers, Right: Model Details & List) -->
      <div class="flex-1 flex overflow-hidden min-h-[420px]">
        <!-- Providers Column -->
        <div class="w-60 border-r border-border bg-muted/25 flex flex-col overflow-hidden shrink-0">
          <div class="flex-1 overflow-y-auto p-2 space-y-3">
            <!-- 1. Built-in LLM Providers -->
            <div>
              <div class="px-2.5 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {{ t('Built-in Support') }}
              </div>
              <div class="space-y-0.5 mt-0.5">
                <button
                  v-for="provider in builtinProviders"
                  :key="provider.id"
                  @click="handleSelectProvider(provider.id)"
                  :class="[
                    'w-full flex items-center justify-between px-2.5 py-1.5 rounded-[4px] text-xs font-medium text-left transition-colors group',
                    selectedProviderId === provider.id
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-foreground/90 hover:bg-accent/70 hover:text-foreground',
                  ]"
                >
                  <div class="flex items-center gap-2.5 truncate min-w-0">
                    <ProviderIcon :provider="provider.id" :size="15" />
                    <span class="truncate">{{ provider.name }}</span>
                  </div>
                  <Check
                    v-if="aiStore.activeProviderId === provider.id"
                    data-testid="provider-active-check"
                    class="w-3.5 h-3.5 text-primary shrink-0 ml-1.5"
                  />
                </button>
              </div>
            </div>

            <!-- 2. CLI Agents -->
            <div>
              <div class="px-2.5 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                <span>{{ t('CLI Agents') }}</span>
                <Terminal class="w-3 h-3 opacity-60" />
              </div>
              <div class="space-y-0.5 mt-0.5">
                <button
                  v-for="provider in cliProviders"
                  :key="provider.id"
                  @click="handleSelectProvider(provider.id)"
                  :class="[
                    'w-full flex items-center justify-between px-2.5 py-1.5 rounded-[4px] text-xs font-medium text-left transition-colors group',
                    selectedProviderId === provider.id
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-foreground/90 hover:bg-accent/70 hover:text-foreground',
                  ]"
                >
                  <div class="flex items-center gap-2.5 truncate min-w-0">
                    <ProviderIcon :provider="provider.id" :size="15" />
                    <span class="truncate">{{ provider.name }}</span>
                  </div>
                  <Check
                    v-if="aiStore.activeProviderId === provider.id"
                    data-testid="provider-active-check"
                    class="w-3.5 h-3.5 text-primary shrink-0 ml-1.5"
                  />
                </button>
              </div>
            </div>
          </div>

          <div class="p-2 border-t border-border shrink-0">
            <button
              @click="openSettings"
              class="arco-btn arco-btn-text w-full"
            >
              <Settings class="w-3.5 h-3.5" />
              <span>{{ t('Configure API Keys') }}</span>
            </button>
          </div>
        </div>

        <!-- Model List & Details Pane (Right) -->
        <div class="flex-1 flex flex-col overflow-hidden bg-background/40">
          <!-- Header for Selected Provider -->
          <div class="px-4 py-2.5 border-b border-border bg-muted/20 flex items-center justify-between shrink-0">
            <div class="flex items-center gap-2.5 min-w-0">
              <ProviderIcon :provider="currentProvider.id" :size="18" />
              <div class="truncate">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-semibold text-foreground">{{ currentProvider.name }}</span>
                  <span class="arco-tag bg-secondary text-muted-foreground border-border font-mono">
                    {{ currentProvider.protocol }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Auto Load Button -->
            <button
              v-if="currentProvider.category !== 'cli'"
              @click="handleRefreshModels"
              :disabled="isFetching"
              class="arco-btn arco-btn-secondary arco-btn-sm shrink-0"
              :title="t('Automatically discover models from API endpoint')"
            >
              <RefreshCw class="w-3 h-3" :class="{ 'animate-spin': isFetching }" />
              <span>{{ isFetching ? t('Fetching...') : t('Auto Load') }}</span>
            </button>
          </div>

          <!-- CLI Agent Banner -->
          <div
            v-if="currentProvider.category === 'cli'"
            class="px-4 py-2 bg-muted/35 border-b border-border flex items-center justify-between text-xs shrink-0"
          >
            <div class="flex items-center gap-2 text-foreground">
              <Terminal class="w-4 h-4 text-primary shrink-0" />
              <span class="text-[11px]">
                {{ t('CLI Command') }}: <code class="font-mono font-semibold bg-muted px-1.5 py-0.5 rounded-[4px] border border-border">{{ currentProvider.cli_command || currentProvider.id }}</code>
              </span>
            </div>
            <span class="text-[10px] text-muted-foreground">
              {{ t('Runs directly via local terminal CLI') }}
            </span>
          </div>

          <!-- Fetch Error Alert -->
          <div
            v-if="fetchError"
            class="px-4 py-2 bg-amber-500/10 border-b border-amber-500/25 text-amber-700 dark:text-amber-300 text-[11px] flex items-center justify-between shrink-0"
          >
            <span class="truncate">{{ t('Model discovery notice: {msg}', { msg: fetchError }) }}</span>
            <button
              @click="aiStore.fetchModelsError[selectedProviderId] = null"
              class="arco-btn arco-btn-text arco-btn-sm ml-2 shrink-0 text-amber-600 dark:text-amber-300"
            >
              {{ t('Dismiss') }}
            </button>
          </div>

          <!-- Model Items Container -->
          <div class="flex-1 overflow-y-auto p-2.5 space-y-1.5">
            <div
              v-if="displayedModels.length === 0"
              class="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground"
            >
              <Cpu class="w-8 h-8 opacity-30 mb-2" />
              <p class="text-xs font-medium">{{ t('No models found') }}</p>
              <p class="text-[11px] mt-1">{{ t('Click "Auto Load" above or enter a model ID below') }}</p>
            </div>

            <div
              v-for="model in displayedModels"
              :key="model.id"
              @click="handleSelectModel(model.id)"
              :class="[
                'group p-3 rounded-[6px] border cursor-pointer transition-colors flex items-center justify-between',
                aiStore.activeModelId === model.id && aiStore.activeProviderId === selectedProviderId
                  ? 'border-primary/45 bg-primary/8 text-foreground'
                  : 'border-border/50 hover:border-border hover:bg-accent/50 text-foreground/90',
              ]"
            >
              <div class="min-w-0 pr-3">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-semibold truncate">{{ model.name || model.id }}</span>
                  <span
                    v-if="aiStore.activeModelId === model.id && aiStore.activeProviderId === selectedProviderId"
                    data-testid="model-active-badge"
                    class="arco-tag bg-primary/15 text-primary border-primary/25 font-semibold"
                  >
                    {{ t('Active') }}
                  </span>
                </div>
                <div class="text-[11px] text-muted-foreground font-mono truncate mt-0.5">
                  {{ model.id }}
                </div>
                <p v-if="model.description" class="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                  {{ model.description }}
                </p>
              </div>

              <div class="shrink-0 flex items-center gap-2">
                <span
                  v-if="model.context_length"
                  class="arco-tag bg-secondary text-muted-foreground border-border font-mono tabular-nums"
                >
                  {{ Math.round(model.context_length / 1024) }}k
                </span>
                <div
                  v-if="aiStore.activeModelId === model.id && aiStore.activeProviderId === selectedProviderId"
                  class="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center"
                >
                  <Check class="w-3 h-3" />
                </div>
              </div>
            </div>
          </div>

          <!-- Bottom: Custom Model ID Input Fallback -->
          <div class="p-3 border-t border-border bg-muted/20 shrink-0">
            <label class="text-[11px] font-medium text-muted-foreground block mb-1.5">
              {{ t('Manual Model ID (Enter any custom or fine-tuned model)') }}
            </label>
            <div class="flex gap-2">
              <input
                v-model="customModelInput"
                type="text"
                placeholder="e.g. gpt-4.5-preview, deepseek-coder-v2, claude-3-7-sonnet..."
                class="arco-input flex-1 font-mono"
                @keydown.enter="handleApplyCustomModel"
              />
              <button
                @click="handleApplyCustomModel"
                :disabled="!customModelInput.trim()"
                class="arco-btn arco-btn-primary h-8 px-3.5"
              >
                {{ t('Apply') }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Popover Footer -->
      <div class="arco-modal-footer justify-between">
        <div class="text-[11px] text-muted-foreground flex items-center gap-1.5 min-w-0">
          <span>{{ t('Current active:') }}</span>
          <ProviderIcon :provider="aiStore.activeProvider.id" :size="13" />
          <span class="font-semibold text-foreground font-mono truncate">{{ aiStore.activeProvider.name }} / {{ aiStore.activeModelId }}</span>
        </div>
        <button
          @click="emit('close')"
          class="arco-btn arco-btn-secondary shrink-0"
        >
          {{ t('Close') }}
        </button>
      </div>
    </div>
  </div>
</Teleport>
</template>
