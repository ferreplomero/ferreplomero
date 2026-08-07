import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

// Raíz del monorepo (dos niveles por encima de apps/web). Evita que Turbopack
// infiera mal el workspace cuando hay otros lockfiles en el sistema.
const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

// Genera public/sw.js a partir de app/sw.ts en cada build (Fase 9 del app
// shell offline). Deshabilitado en dev para no interferir con HMR. El
// registro del service worker en el navegador lo hace Serwist automáticamente
// (opción `register`, activada por defecto) — no hace falta código propio.
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: true,
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Consumimos los paquetes del monorepo como código fuente TypeScript.
  transpilePackages: ["@arkiteq/ui", "@arkiteq/core", "@arkiteq/db"],
  // Ambos deben apuntar a la raíz del monorepo (el runtime de Next en Netlify
  // también usa el output file tracing para empaquetar las funciones server).
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot,
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "@arkiteq/ui", "recharts"],
    // Las Server Actions limitan el cuerpo a 1 MB por defecto; subir fotos de
    // productos (hasta 5 MB) lo excedía. Se amplía con holgura para el multipart.
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
  images: {
    // Hostname derivado de la env var (no hardcodeado) para que next/image no
    // rompa silenciosamente cuando el proyecto de Supabase cambie.
    remotePatterns: process.env.NEXT_PUBLIC_SUPABASE_URL
      ? [{ protocol: "https", hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname }]
      : [],
  },
};

export default withSerwist(nextConfig);
