<script setup lang="ts">
import { ref, watch } from 'vue';
import { AlertTriangle, HelpCircle } from 'lucide-vue-next';
import ArcoModal from '@/components/ui/ArcoModal.vue';
import { useConfirmationStore } from '@/stores/confirmation';
import { useI18n } from '@/i18n';

const store = useConfirmationStore();
const inputValue = ref('');
const { t } = useI18n();

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
  <ArcoModal
    v-if="store.pending"
    :title="store.pending.options.title || 'Confirmation Dialog'"
    :aria-label="store.pending.options.title || 'Confirmation Dialog'"
    z-index-class="z-[100]"
    max-width-class="max-w-md"
    :icon-bg-class="store.pending.options.danger ? 'bg-destructive/12 text-destructive' : 'bg-primary/12 text-primary'"
    @close="cancel"
  >
    <template #icon>
      <AlertTriangle v-if="store.pending.options.danger" class="w-4 h-4" />
      <HelpCircle v-else class="w-4 h-4" />
    </template>

    <p class="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
      {{ store.pending.options.message }}
    </p>
    <label v-if="store.pending.options.inputLabel" class="block space-y-1.5">
      <span class="text-xs font-medium text-foreground">{{ store.pending.options.inputLabel }}</span>
      <input
        v-model="inputValue"
        autofocus
        class="arco-input"
        @keydown.enter="accept"
      />
    </label>

    <template #footer>
      <button type="button" class="arco-btn arco-btn-secondary" @click="cancel">
        {{ store.pending.options.cancelText || t('Cancel') }}
      </button>
      <button
        type="button"
        class="arco-btn"
        :class="store.pending.options.danger ? 'arco-btn-danger' : 'arco-btn-primary'"
        @click="accept"
      >
        {{ store.pending.options.confirmText || t('Confirm') }}
      </button>
    </template>
  </ArcoModal>
</template>
