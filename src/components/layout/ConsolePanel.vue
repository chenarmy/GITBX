<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue';
import { useConsoleStore } from '@/stores/console';
import {
  Terminal,
  Trash2,
  Copy,
  Check,
  X,
  Search,
} from 'lucide-vue-next';
import { useI18n } from '@/i18n';

const consoleStore = useConsoleStore();
const searchQuery = ref('');
const isCopied = ref(false);
const scrollContainer = ref<HTMLElement | null>(null);
const { t } = useI18n();

const filteredLogs = computed(() => {
  let list = consoleStore.logs;
  if (consoleStore.activeFilter === 'command') {
    list = list.filter((l) => l.level === 'command');
  } else if (consoleStore.activeFilter === 'error') {
    list = list.filter((l) => l.level === 'error' || l.level === 'warning');
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter(
      (l) =>
        (l.command && l.command.toLowerCase().includes(q)) ||
        l.message.toLowerCase().includes(q) ||
        (l.detail && l.detail.toLowerCase().includes(q))
    );
  }
  return list;
});

function formatTime(timestamp: number) {
  const d = new Date(timestamp);
  return d.toTimeString().split(' ')[0] + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function handleCopyAll() {
  const text = filteredLogs.value
    .map(
      (l) =>
        `[${formatTime(l.timestamp)}] [${l.level.toUpperCase()}] ${l.command ? `> ${l.command}\n` : ''}${l.message}${l.detail ? `\n${l.detail}` : ''}`
    )
    .join('\n\n');
  navigator.clipboard.writeText(text).catch((err) => {
    console.warn('Failed to copy logs to clipboard:', err);
  });
  isCopied.value = true;
  setTimeout(() => {
    isCopied.value = false;
  }, 2000);
}

watch(
  () => consoleStore.logs.length,
  async () => {
    await nextTick();
    if (scrollContainer.value) {
      scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
    }
  }
);
</script>

<template>
  <div class="dbx-console h-full min-h-0 bg-card flex flex-col select-none text-xs z-20">
    <!-- Console Toolbar Header -->
    <div class="dbx-pane-header h-9 border-b border-border flex items-center justify-between px-3.5 select-none">
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="flex items-center gap-1.5 font-semibold text-foreground shrink-0">
          <Terminal class="w-3.5 h-3.5 text-primary" />
          <span>{{ t('Output & Operation Console') }}</span>
        </div>

        <div class="h-3.5 w-px bg-border"></div>

        <!-- Filter segmented tabs -->
        <div class="arco-segmented">
          <button
            @click="consoleStore.activeFilter = 'all'"
            class="arco-segmented-item text-[11px] py-0.5 px-2"
            :class="{ 'arco-segmented-item-active': consoleStore.activeFilter === 'all' }"
          >
            {{ t('All') }} ({{ consoleStore.logs.length }})
          </button>
          <button
            @click="consoleStore.activeFilter = 'command'"
            class="arco-segmented-item text-[11px] py-0.5 px-2"
            :class="{ 'arco-segmented-item-active': consoleStore.activeFilter === 'command' }"
          >
            {{ t('Git Commands') }} ({{ consoleStore.logs.filter(l => l.level === 'command').length }})
          </button>
          <button
            @click="consoleStore.activeFilter = 'error'"
            class="arco-segmented-item text-[11px] py-0.5 px-2"
            :class="consoleStore.activeFilter === 'error' ? 'arco-segmented-item-active text-destructive' : ''"
          >
            {{ t('Errors') }} ({{ consoleStore.logs.filter(l => l.level === 'error').length }})
          </button>
        </div>
      </div>

      <!-- Right actions: Search, Copy, Clear, Close -->
      <div class="flex items-center gap-1.5 shrink-0">
        <!-- Search filter input -->
        <div class="relative flex items-center">
          <Search class="w-3 h-3 text-muted-foreground absolute left-2.5 pointer-events-none" />
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="t('Filter logs...')"
            class="arco-input arco-input-sm h-6 pl-7 pr-2 w-40"
          />
        </div>

        <button
          @click="handleCopyAll"
          class="arco-icon-btn arco-icon-btn-sm"
          :title="t('Copy Console Logs')"
        >
          <component :is="isCopied ? Check : Copy" class="w-3.5 h-3.5" :class="{ 'text-emerald-500': isCopied }" />
        </button>

        <button
          @click="consoleStore.clearLogs"
          class="arco-icon-btn arco-icon-btn-sm"
          :title="t('Clear Console')"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </button>

        <button
          @click="consoleStore.isOpen = false"
          class="arco-icon-btn arco-icon-btn-sm"
          :title="t('Close Console')"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Logs Content Stream -->
    <div
      ref="scrollContainer"
      class="flex-1 overflow-y-auto p-2.5 font-mono text-[11px] space-y-1 bg-card text-foreground select-text"
    >
      <div v-if="filteredLogs.length === 0" class="text-center py-6 text-muted-foreground">
        {{ t('No log entries matching filter.') }}
      </div>

      <div
        v-for="log in filteredLogs"
        :key="log.id"
        class="flex items-start gap-2 py-1 hover:bg-accent/50 rounded-[4px] px-2 transition-colors"
      >
        <!-- Timestamp -->
        <span class="text-muted-foreground/65 select-none shrink-0 font-sans text-[10px] mt-0.5 tabular-nums">
          {{ formatTime(log.timestamp) }}
        </span>

        <!-- Level badge -->
        <span
          v-if="log.level === 'command'"
          class="arco-tag bg-primary/10 text-primary border-primary/25 select-none shrink-0 font-mono font-semibold"
        >
          CMD
        </span>
        <span
          v-else-if="log.level === 'success'"
          class="arco-tag bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25 select-none shrink-0 font-mono font-semibold"
        >
          OK
        </span>
        <span
          v-else-if="log.level === 'error'"
          class="arco-tag bg-destructive/10 text-destructive border-destructive/25 select-none shrink-0 font-mono font-semibold"
        >
          ERR
        </span>
        <span
          v-else-if="log.level === 'warning'"
          class="arco-tag bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25 select-none shrink-0 font-mono font-semibold"
        >
          WARN
        </span>
        <span
          v-else
          class="arco-tag bg-secondary text-muted-foreground border-border select-none shrink-0 font-mono font-semibold"
        >
          INFO
        </span>

        <!-- Message and Command Details -->
        <div class="flex-1 overflow-x-auto">
          <div v-if="log.command" class="font-semibold text-primary flex items-center gap-1">
            <span class="text-muted-foreground select-none">$</span>
            <span>{{ log.command }}</span>
          </div>

          <div
            :class="{
              'text-emerald-600 dark:text-emerald-400': log.level === 'success',
              'text-destructive font-semibold': log.level === 'error',
              'text-amber-600 dark:text-amber-400': log.level === 'warning',
              'text-muted-foreground': log.level === 'command',
              'text-foreground': log.level === 'info',
            }"
          >
            {{ log.message }}
          </div>

          <pre v-if="log.detail" class="mt-1 p-2 rounded-[4px] bg-muted/60 border border-border/50 text-[10px] text-muted-foreground whitespace-pre-wrap overflow-x-auto">{{ log.detail }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>
