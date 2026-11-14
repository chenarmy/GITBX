<script setup lang="ts">
import { useNotificationStore } from '@/stores/notification';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
} from 'lucide-vue-next';

const notificationStore = useNotificationStore();

function getIcon(type: string) {
  switch (type) {
    case 'success':
      return CheckCircle2;
    case 'error':
      return AlertCircle;
    case 'warning':
      return AlertTriangle;
    default:
      return Info;
  }
}

function getIconBadgeClass(type: string) {
  switch (type) {
    case 'success':
      return 'bg-emerald-500/12 text-emerald-500';
    case 'error':
      return 'bg-rose-500/12 text-rose-500';
    case 'warning':
      return 'bg-amber-500/12 text-amber-500';
    default:
      return 'bg-primary/12 text-primary';
  }
}

function getAccentBorderClass(type: string) {
  switch (type) {
    case 'success':
      return 'border-emerald-500/30';
    case 'error':
      return 'border-rose-500/30';
    case 'warning':
      return 'border-amber-500/30';
    default:
      return 'border-primary/30';
  }
}
</script>

<template>
  <div
    role="region"
    aria-label="Notifications"
    aria-live="polite"
    class="fixed top-12 right-4 z-50 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)] pointer-events-none select-none"
  >
    <transition-group
      enter-active-class="transform ease-out duration-200 transition"
      enter-from-class="translate-x-4 opacity-0"
      enter-to-class="translate-x-0 opacity-100"
      leave-active-class="transition ease-in duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0 translate-x-2"
    >
      <div
        v-for="toast in notificationStore.toasts"
        :key="toast.id"
        role="status"
        :aria-live="toast.type === 'error' ? 'assertive' : 'polite'"
        class="pointer-events-auto arco-popover px-3.5 py-3 rounded-[8px] flex items-start gap-2.5 text-xs"
        :class="getAccentBorderClass(toast.type)"
      >
        <div
          class="w-6 h-6 rounded-[5px] flex items-center justify-center shrink-0 mt-0.5"
          :class="getIconBadgeClass(toast.type)"
        >
          <component :is="getIcon(toast.type)" aria-hidden="true" class="w-4 h-4" />
        </div>
        <div class="flex-1 min-w-0 pr-1">
          <div class="font-semibold text-foreground leading-5">{{ toast.title }}</div>
          <div v-if="toast.message" class="text-[11px] text-muted-foreground mt-0.5 leading-relaxed break-words">{{ toast.message }}</div>
        </div>
        <button
          type="button"
          aria-label="Close notification"
          @click="notificationStore.removeToast(toast.id)"
          class="arco-icon-btn arco-icon-btn-sm shrink-0 -mr-1 -mt-0.5"
        >
          <X aria-hidden="true" class="w-3.5 h-3.5" />
        </button>
      </div>
    </transition-group>
  </div>
</template>
