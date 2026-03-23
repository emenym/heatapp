import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";

const proxyTarget = process.env.VITE_PROXY_TARGET || "http://localhost:8081";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: ["quark", "localhost", "127.0.0.1"],
    proxy: {
      "/api": {
        target: proxyTarget,
        changeOrigin: true,
      },
      "/ws": {
        target: proxyTarget,
        changeOrigin: true,
        ws: true,
      },
      "/health": {
        target: proxyTarget,
        changeOrigin: true,
      },
    },
  },
});
