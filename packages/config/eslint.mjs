// @ts-check
/**
 * Configuración ESLint plana (flat config) compartida para todo el monorepo.
 * TypeScript estricto (prohíbe `any`), React, React Hooks, accesibilidad (jsx-a11y)
 * y desactiva reglas de formato (lo gestiona Prettier).
 */
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";
import globals from "globals";

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/*.config.js",
      "**/*.config.cjs",
      "**/*.config.mjs",
      "**/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2022,
      },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    settings: {
      // Fijada para evitar el aviso de "detect" en paquetes sin React (db/core).
      react: { version: "19.0" },
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // No usar React global (Next.js / React 19 JSX transform)
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",

      // TypeScript estricto: nada de `any`.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-non-null-assertion": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // Scripts y archivos de configuración en JS plano corren en Node y usan CommonJS.
    files: ["**/*.{js,cjs,mjs}", "**/scripts/**/*.{js,cjs,mjs}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-var-requires": "off",
    },
  },
  prettier,
];
