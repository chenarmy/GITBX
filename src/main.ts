import { createApp } from 'vue';
import { createPinia } from 'pinia';
import './assets/main.css';
import { initializeAppConfig, CONFIG_KEYS } from '@/services/appConfig';
import { applyStoredFontEarly, clampFontSize, getFontById } from '@/services/fonts';

/** Apply the stored font before Vue mounts to avoid a flash of unstyled text. */
function applyStoredFontBeforeMount() {
  try {
    const fontId = localStorage.getItem(CONFIG_KEYS.fontId) || 'system-default';
    const monoId = localStorage.getItem(CONFIG_KEYS.monoFontId) || 'system-mono';
    const size = clampFontSize(Number(localStorage.getItem(CONFIG_KEYS.fontSize) ?? 12));
    applyStoredFontEarly(
      getFontById(fontId)?.family || 'inherit',
      size,
      getFontById(monoId)?.family || 'inherit',
    );
  } catch {
    // The settings store applies the font again once it initializes.
  }
}

async function bootstrap() {
  applyStoredFontBeforeMount();
  await initializeAppConfig();
  await import('./i18n');
  const { default: App } = await import('./App.vue');
  const app = createApp(App);
  const pinia = createPinia();

  app.use(pinia);
  app.mount('#app');
}

void bootstrap();
