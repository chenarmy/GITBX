import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";
import fs from "fs";

const tauriConfig = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "./src-tauri/tauri.conf.json"), "utf8"),
);
const updaterPublicKey = tauriConfig.plugins?.updater?.pubkey as string | undefined;
const updaterConfigured = Boolean(
  updaterPublicKey && !updaterPublicKey.startsWith("__TAURI_UPDATER_"),
);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  define: {
    __GITBX_UPDATER_CONFIGURED__: JSON.stringify(updaterConfigured),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        // Follow the same env vars as the Axum backend (src-web/src/main.rs):
        // a custom GITBX_WEB_PORT/HOST would otherwise cause ECONNREFUSED
        // between the Vite dev server and the backend.
        target: `http://${process.env.GITBX_WEB_HOST || "127.0.0.1"}:${process.env.GITBX_WEB_PORT || "8080"}`,
        changeOrigin: true,
      },
      "/ws": {
        target: `ws://${process.env.GITBX_WEB_HOST || "127.0.0.1"}:${process.env.GITBX_WEB_PORT || "8080"}`,
        ws: true,
      },
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: process.env.TAURI_PLATFORM == "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
