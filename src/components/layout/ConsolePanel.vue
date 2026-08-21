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

const consoleStore = useConsoleStore();
const searchQuery = ref('');
const isCopied = ref(false);
const scrollContainer = ref<HTMLElement | null>(null);

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
  navigator.clipboard.writeText(text);
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
  <div
    v-if="consoleStore.isOpen"
    class="dbx-console h-60 bg-card border-t border-border flex flex-col select-none text-xs z-20"
  >
    <!-- Console Toolbar Header -->
    <div class="dbx-pane-header h-8 bg-muted/50 border-b border-border flex items-center justify-between px-3 select-none">
      <div class="flex items-center space-x-2">
        <div class="flex items-center space-x-1.5 font-bold text-foreground">
          <Terminal class="w-3.5 h-3.5 text-primary" />
          <span>Output & Operation Console</span>
        </div>

        <div class="h-3.5 w-[1px] bg-border mx-1"></div>

        <!-- Filter tabs -->
        <div class="flex items-center space-x-1">
          <button
            @click="consoleStore.activeFilter = 'all'"
            class="px-2 py-0.5 rounded text-[11px] font-semibold transition"
            :class="consoleStore.activeFilter === 'all' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'"
          >
            All ({{ consoleStore.logs.length }})
          </button>
          <button
            @click="consoleStore.activeFilter = 'command'"
            class="px-2 py-0.5 rounded text-[11px] font-semibold transition"
            :class="consoleStore.activeFilter === 'command' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'"
          >
            Git Commands ({{ consoleStore.logs.filter(l => l.level === 'command').length }})
          </button>
          <button
            @click="consoleStore.activeFilter = 'error'"
            class="px-2 py-0.5 rounded text-[11px] font-semibold transition"
            :class="consoleStore.activeFilter === 'error' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : 'text-muted-foreground hover:text-foreground'"
          >
            Errors ({{ consoleStore.logs.filter(l => l.level === 'error').length }})
          </button>
        </div>
      </div>

      <!-- Right actions: Search, Copy, Clear, Close -->
      <div class="flex items-center space-x-2">
        <!-- Search filter input -->
        <div class="relative flex items-center">
          <Search class="w-3 h-3 text-muted-foreground absolute left-2 pointer-events-none" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Filter logs..."
            class="bg-background border border-border rounded-md pl-6 pr-2 py-0.5 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary w-36"
          />
        </div>

        <button
          @click="handleCopyAll"
          class="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition flex items-center space-x-1"
          title="Copy Console Logs"
        >
          <component :is="isCopied ? Check : Copy" class="w-3.5 h-3.5" :class="{ 'text-emerald-500': isCopied }" />
        </button>

        <button
          @click="consoleStore.clearLogs"
          class="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition"
          title="Clear Console"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </button>

        <button
          @click="consoleStore.isOpen = false"
          class="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition"
          title="Close Console"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Logs Content Stream -->
    <div
      ref="scrollContainer"
      class="flex-1 overflow-y-auto p-2 font-mono text-[11px] space-y-1 bg-card text-foreground select-text"
    >
      <div v-if="filteredLogs.length === 0" class="text-center py-6 text-muted-foreground">
        No log entries matching filter.
      </div>

      <div
        v-for="log in filteredLogs"
        :key="log.id"
        class="flex items-start space-x-2 py-0.5 hover:bg-secondary/50 rounded px-1.5 transition"
      >
        <!-- Timestamp -->
        <span class="text-muted-foreground/60 select-none shrink-0 font-sans text-[10px] mt-0.5">
          {{ formatTime(log.timestamp) }}
        </span>

        <!-- Level badge -->
        <span
          v-if="log.level === 'command'"
          class="px-1 rounded text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800 select-none shrink-0"
        >
          CMD
        </span>
        <span
          v-else-if="log.level === 'success'"
          class="px-1 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 select-none shrink-0"
        >
          OK
        </span>
        <span
          v-else-if="log.level === 'error'"
          class="px-1 rounded text-[10px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800 select-none shrink-0"
        >
          ERR
        </span>
        <span
          v-else-if="log.level === 'warning'"
          class="px-1 rounded text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800 select-none shrink-0"
        >
          WARN
        </span>
        <span
          v-else
          class="px-1 rounded text-[10px] font-bold bg-secondary text-muted-foreground border border-border select-none shrink-0"
        >
          INFO
        </span>

        <!-- Message and Command Details -->
        <div class="flex-1 overflow-x-auto">
          <div v-if="log.command" class="font-bold text-primary flex items-center space-x-1">
            <span class="text-muted-foreground select-none">$</span>
            <span>{{ log.command }}</span>
          </div>

          <div
            :class="{
              'text-emerald-600 dark:text-emerald-400': log.level === 'success',
              'text-rose-600 dark:text-rose-400 font-semibold': log.level === 'error',
              'text-amber-600 dark:text-amber-400': log.level === 'warning',
              'text-muted-foreground': log.level === 'command',
              'text-foreground': log.level === 'info',
            }"
          >
            {{ log.message }}
          </div>

          <pre v-if="log.detail" class="mt-1 p-1.5 rounded bg-muted/40 text-[10px] text-muted-foreground whitespace-pre-wrap overflow-x-auto">{{ log.detail }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>
