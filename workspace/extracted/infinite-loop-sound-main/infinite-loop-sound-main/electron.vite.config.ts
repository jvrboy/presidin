import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite config for the Electron main process build
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist-electron",
    lib: {
      entry: "electron/main.ts",
      formats: ["cjs"],
      fileName: () => "main.js",
    },
    rollupOptions: {
      external: ["electron", "path", "fs"],
    },
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
