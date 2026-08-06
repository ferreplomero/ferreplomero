import { ArkiteqMark, NodeGraphBackdrop } from "@arkiteq/ui";

/**
 * Fallback global mientras un layout `async` (p. ej. `(app)/layout.tsx` o
 * `(vertical)/minimarket/layout.tsx`) resuelve sus consultas antes de poder
 * renderizar. Sin este archivo, Next no tiene ningún límite de Suspense por
 * encima de esos layouts y el navegador se queda con el `<body>` vacío
 * (pantalla en blanco/negro) hasta que TODA la cadena de `await` termina. Las
 * rutas que ya tienen su propio `loading.tsx` más cercano (catálogo, admin,
 * cada pantalla del vertical minimarket) siguen usando el suyo — Next
 * siempre prioriza el límite más próximo, este solo cubre lo que no tiene
 * ninguno más cerca.
 */
export default function RootLoading() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 text-center">
      <NodeGraphBackdrop className="opacity-50 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      <div className="relative flex flex-col items-center gap-4">
        <span className="relative inline-flex items-center justify-center">
          <span className="border-brand-500/25 border-t-brand-500 size-14 animate-spin rounded-full border-4 motion-reduce:animate-none" />
          <ArkiteqMark className="text-brand-500 absolute size-6" />
        </span>
        <p className="text-muted-foreground text-sm">Cargando…</p>
      </div>
    </div>
  );
}
