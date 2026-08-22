import { defineStore } from 'pinia';
import { ref } from 'vue';

const THEME_KEY = 'gitbx_theme';

function getInitialTheme(): boolean {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
  } catch {}
  return false; // Default: Light mode
}

export const useSettingsStore = defineStore('settings', () => {
  const isDark = ref<boolean>(getInitialTheme());
  const authorName = ref<string>('Developer');
  const authorEmail = ref<string>('dev@gitbx.io');
  const isSettingsModalOpen = ref<boolean>(false);

  const applyTheme = () => {
    if (isDark.value) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
    try {
      localStorage.setItem(THEME_KEY, isDark.value ? 'dark' : 'light');
    } catch {}
  };

  const toggleTheme = () => {
    isDark.value = !isDark.value;
    applyTheme();
  };

  // Apply on startup
  applyTheme();

  return {
    isDark,
    authorName,
    authorEmail,
    isSettingsModalOpen,
    toggleTheme,
    applyTheme,
  };
});
