import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";
import { gitbxDevPlugin } from "./vite-plugin-gitbx";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), gitbxDevPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: process.env.TAURI_PLATFORM == "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
