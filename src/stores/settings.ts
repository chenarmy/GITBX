import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useSettingsStore = defineStore('settings', () => {
  const isDark = ref<boolean>(true);
  const authorName = ref<string>('Developer');
  const authorEmail = ref<string>('dev@gitbx.io');
  const isSettingsModalOpen = ref<boolean>(false);

  const toggleTheme = () => {
    isDark.value = !isDark.value;
    if (isDark.value) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  };

  return {
    isDark,
    authorName,
    authorEmail,
    isSettingsModalOpen,
    toggleTheme,
  };
});
