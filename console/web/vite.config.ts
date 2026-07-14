import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: Vite serves the SPA and proxies /api to the Console server on 7317.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 7318,
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: "http://127.0.0.1:7317",
        changeOrigin: true,
      },
    },
  },
  build: { outDir: "dist", sourcemap: true },
});
