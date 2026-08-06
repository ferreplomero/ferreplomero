import config from "@arkiteq/config/eslint";
import next from "@next/eslint-plugin-next";

export default [
  ...config,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "@next/next": next },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs["core-web-vitals"].rules,
    },
  },
  {
    // Los assets estáticos (p. ej. el service worker) y los artefactos de build no se lintean
    // como código de app.
    ignores: [".next/**", ".open-next/**", "next-env.d.ts", "public/**", "app/sw.ts"],
  },
];
