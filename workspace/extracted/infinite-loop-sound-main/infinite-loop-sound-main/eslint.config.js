import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi", ".vercel", ".nitro", "node_modules"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // ESLint 10 / eslint-plugin-react-hooks 7 adds React Compiler checks to
      // the recommended preset. Keep these visible without failing CI while
      // the app is incrementally migrated to stricter compiler constraints.
      "react-hooks/purity": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/static-components": "warn",
      "no-useless-assignment": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-unused-vars": "off",
      // `any` is used intentionally for dynamic imports, the Cloudflare Workers
      // runtime, and untyped Supabase rows — keep it visible as a warning rather
      // than a hard error so `lint` stays green while flagging future usages.
      "@typescript-eslint/no-explicit-any": "warn",
      // Empty catch blocks are an intentional "best-effort, ignore failures"
      // pattern throughout the engine/UI; other empty blocks remain errors.
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  eslintPluginPrettier,
);
