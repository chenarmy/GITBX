<script setup lang="ts">
import { ref, watch } from 'vue';
import { X, AlertTriangle } from 'lucide-vue-next';
import { useConfirmationStore } from '@/stores/confirmation';

const store = useConfirmationStore();
const inputValue = ref('');

watch(() => store.pending, (request) => {
  inputValue.value = request?.options.defaultValue || '';
}, { deep: true });

function cancel() {
  store.resolve(null);
}

function accept() {
  store.resolve(store.pending?.options.inputLabel ? inputValue.value.trim() : true);
}
</script>

<template>
  <div
    v-if="store.pending"
    class="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
    @keydown.esc="cancel"
  >
    <div class="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden text-sm" @click.stop>
      <div class="h-11 px-4 flex items-center justify-between border-b border-border bg-muted/40">
        <div class="flex items-center gap-2 font-semibold">
          <AlertTriangle v-if="store.pending.options.danger" class="w-4 h-4 text-rose-500" />
          <span>{{ store.pending.options.title }}</span>
        </div>
        <button class="p-1 rounded hover:bg-accent" @click="cancel"><X class="w-4 h-4" /></button>
      </div>
      <div class="p-4 space-y-3">
        <p class="text-muted-foreground whitespace-pre-wrap">{{ store.pending.options.message }}</p>
        <label v-if="store.pending.options.inputLabel" class="block space-y-1.5">
          <span class="text-xs font-medium">{{ store.pending.options.inputLabel }}</span>
          <input
            v-model="inputValue"
            autofocus
            class="w-full px-2.5 py-2 rounded-md border border-border bg-background outline-none focus:ring-2 focus:ring-primary/40"
            @keydown.enter="accept"
          />
        </label>
      </div>
      <div class="h-12 px-4 flex items-center justify-end gap-2 border-t border-border bg-muted/20">
        <button class="px-3 py-1.5 rounded hover:bg-accent text-muted-foreground" @click="cancel">
          {{ store.pending.options.cancelText || 'Cancel' }}
        </button>
        <button
          class="px-4 py-1.5 rounded font-semibold text-white"
          :class="store.pending.options.danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-primary hover:bg-primary/90'"
          @click="accept"
        >
          {{ store.pending.options.confirmText || 'Confirm' }}
        </button>
      </div>
    </div>
  </div>
</template>
