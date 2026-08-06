// Config raíz solo para `lint-staged` (pre-commit), que invoca ESLint desde la
// raíz del repo — la config flat de ESLint 9 se resuelve por cwd, no por
// archivo, así que cada paquete además tiene su propio `eslint.config.mjs`
// (ver `apps/web/eslint.config.mjs`) para `pnpm lint` (turbo, cwd por paquete).
import config from "@arkiteq/config/eslint";

export default [
  ...config,
  {
    // Mismo criterio que apps/web/eslint.config.mjs y apps/web/tsconfig.json:
    // el service worker usa el lib "webworker", incompatible con "dom".
    ignores: ["apps/web/app/sw.ts"],
  },
];
