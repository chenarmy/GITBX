<script setup lang="ts">
import { X } from 'lucide-vue-next';

withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    ariaLabel?: string;
    maxWidthClass?: string;
    heightClass?: string;
    zIndexClass?: string;
    iconBgClass?: string;
    closeDisabled?: boolean;
    closeOnBackdrop?: boolean;
    rawBody?: boolean;
    bodyClass?: string;
    footerClass?: string;
  }>(),
  {
    subtitle: undefined,
    ariaLabel: undefined,
    maxWidthClass: 'max-w-md',
    heightClass: 'max-h-[85vh]',
    zIndexClass: 'z-50',
    iconBgClass: 'bg-primary/10 text-primary',
    closeDisabled: false,
    closeOnBackdrop: false,
    rawBody: false,
    bodyClass: '',
    footerClass: '',
  },
);

const emit = defineEmits<{
  close: [];
}>();

function handleEscape() {
  emit('close');
}

function handleBackdropClick() {
  emit('close');
}
</script>

<template>
  <div
    class="fixed arco-modal-backdrop"
    :class="zIndexClass"
    @keydown.esc.window="!closeDisabled && handleEscape()"
    @click="closeOnBackdrop && !closeDisabled && handleBackdropClick()"
  >
    <div
      role="dialog"
      aria-modal="true"
      :aria-label="ariaLabel || title"
      class="arco-modal"
      :class="[maxWidthClass, heightClass]"
      @click.stop
    >
      <header class="arco-modal-header">
        <div class="arco-modal-title-group">
          <div v-if="$slots.icon" class="arco-modal-icon" :class="iconBgClass">
            <slot name="icon" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 min-w-0">
              <slot name="title">
                <h2 class="arco-modal-title">{{ title }}</h2>
              </slot>
            </div>
            <p v-if="subtitle" class="text-[11px] text-muted-foreground truncate mt-0.5">
              {{ subtitle }}
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0 ml-3">
          <slot name="header-extra" />
          <button
            type="button"
            aria-label="Close dialog"
            class="arco-modal-close"
            :disabled="closeDisabled"
            @click="emit('close')"
          >
            <X class="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <slot name="below-header" />

      <div v-if="!rawBody" class="arco-modal-body" :class="bodyClass">
        <slot />
      </div>
      <slot v-else />

      <footer v-if="$slots.footer" class="arco-modal-footer" :class="footerClass">
        <slot name="footer" />
      </footer>
    </div>
  </div>
</template>
