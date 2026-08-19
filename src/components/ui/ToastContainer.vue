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

function getColorClass(type: string) {
  switch (type) {
    case 'success':
      return 'border-emerald-500/40 bg-[#12231e] text-emerald-300';
    case 'error':
      return 'border-rose-500/40 bg-[#2d161a] text-rose-300';
    case 'warning':
      return 'border-amber-500/40 bg-[#2b2112] text-amber-300';
    default:
      return 'border-blue-500/40 bg-[#141e30] text-blue-300';
  }
}
</script>

<template>
  <div class="fixed top-12 right-4 z-50 flex flex-col space-y-2 max-w-sm pointer-events-none select-none">
    <transition-group
      enter-active-class="transform ease-out duration-300 transition"
      enter-from-class="translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2"
      enter-to-class="translate-y-0 opacity-100 sm:translate-x-0"
      leave-active-class="transition ease-in duration-100"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-for="toast in notificationStore.toasts"
        :key="toast.id"
        class="pointer-events-auto p-3 rounded-lg border shadow-xl flex items-start space-x-2.5 text-xs backdrop-blur-md"
        :class="getColorClass(toast.type)"
      >
        <component :is="getIcon(toast.type)" class="w-4 h-4 shrink-0 mt-0.5" />
        <div class="flex-1 pr-2">
          <div class="font-bold text-foreground">{{ toast.title }}</div>
          <div v-if="toast.message" class="text-[11px] opacity-90 mt-0.5">{{ toast.message }}</div>
        </div>
        <button
          @click="notificationStore.removeToast(toast.id)"
          class="p-0.5 rounded hover:bg-black/20 opacity-70 hover:opacity-100 transition"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </transition-group>
  </div>
</template>
