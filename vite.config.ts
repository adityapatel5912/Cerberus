import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const API_TARGET = process.env.CERBERUS_BACKEND_URL ?? "http://127.0.0.1:3000";

// Local mode: Vite owns the UI on 5173 and proxies every API/MCP call to the
// Express gateway on 3000. Cloud mode: the gateway serves the built bundle.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "src/shared"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: false },
      "/mcp": { target: API_TARGET, changeOrigin: false },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    target: "es2022",
  },
});
