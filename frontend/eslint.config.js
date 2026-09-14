import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const NETWORK_MESSAGE =
  "All backend calls go through src/api/client.ts. Import `api` from there instead.";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // The API client rule (AGENTS.md): no network access outside src/api/client.ts,
      // and nothing outside src/api/ may reach into the mock server.
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: NETWORK_MESSAGE },
        { name: "XMLHttpRequest", message: NETWORK_MESSAGE },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "axios", message: NETWORK_MESSAGE }],
          patterns: [{ group: ["**/api/mock", "**/api/mock/*"], message: NETWORK_MESSAGE }],
        },
      ],
    },
  },
  {
    files: ["src/api/**/*.ts"],
    rules: {
      "no-restricted-globals": "off",
      "no-restricted-imports": "off",
    },
  },
);
