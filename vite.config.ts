import { defineConfig } from "vite";

// Tauri erwartet einen festen Port im Entwicklungsmodus.
export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 2000,
  },
});
