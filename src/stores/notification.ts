import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
  duration?: number;
}

export const useNotificationStore = defineStore('notification', () => {
  const toasts = ref<ToastMessage[]>([]);

  const addToast = (toast: Omit<ToastMessage, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: ToastMessage = { ...toast, id };
    toasts.value.push(newToast);

    const duration = toast.duration || 3500;
    setTimeout(() => {
      removeToast(id);
    }, duration);

    return id;
  };

  const removeToast = (id: string) => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  };

  const info = (title: string, message?: string) => addToast({ type: 'info', title, message });
  const success = (title: string, message?: string) => addToast({ type: 'success', title, message });
  const warning = (title: string, message?: string) => addToast({ type: 'warning', title, message });
  const error = (title: string, message?: string) => addToast({ type: 'error', title, message, duration: 5000 });

  return {
    toasts,
    addToast,
    removeToast,
    info,
    success,
    warning,
    error,
  };
});
