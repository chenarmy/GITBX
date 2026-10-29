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
const fontPackRoot = path.resolve(__dirname, "./font-packs");

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    {
      name: "gitbx-font-packs-dev",
      apply: "serve",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const pathname = request.url?.split("?", 1)[0] || "";
          if (!pathname.startsWith("/font-packs/")) return next();
          const relative = decodeURIComponent(pathname.slice("/font-packs/".length));
          const filePath = path.resolve(fontPackRoot, ...relative.split("/"));
          if (!filePath.startsWith(`${fontPackRoot}${path.sep}`) || path.extname(filePath) !== ".woff2") {
            response.statusCode = 404;
            return response.end();
          }
          fs.stat(filePath, (error, stats) => {
            if (error || !stats.isFile()) {
              response.statusCode = 404;
              response.end();
              return;
            }
            response.setHeader("Content-Type", "font/woff2");
            response.setHeader("Content-Length", String(stats.size));
            fs.createReadStream(filePath).pipe(response);
          });
        });
      },
    },
  ],
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
