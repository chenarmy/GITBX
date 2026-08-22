import { createApp } from 'vue';
import { createPinia } from 'pinia';
import './assets/main.css';
import { initializeAppConfig } from '@/services/appConfig';

async function bootstrap() {
  await initializeAppConfig();
  await import('./i18n');
  const { default: App } = await import('./App.vue');
  const app = createApp(App);
  const pinia = createPinia();

  app.use(pinia);
  app.mount('#app');
}

void bootstrap();
