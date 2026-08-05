import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  globalIgnores(["dist/**", "node_modules/**", ".wrangler/**"]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  reactRefresh.configs.vite,
  {
    rules: {
      // These effects initialize Firebase state and reset it when the signed-in
      // user changes; both updates are intentional subscription setup.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        URL: "readonly",
      },
    },
  },
]);

export default eslintConfig;
