import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

/** Vitest configuration — mirrors the path alias (`@/*` → project root)
 *  already declared in `tsconfig.json` so test files can import the
 *  shared modules the same way app code does. Without this, vitest's
 *  Vite resolver does not honor TypeScript path mappings and tests
 *  importing through `@/` fail to load. */
export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      "@shared": path.resolve(root, "shared"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
