/**
 * Wrappers propios de observabilidad. El resto del código depende de ESTA API,
 * no de Sentry/PostHog directamente, de modo que podemos cambiar de proveedor
 * sin tocar la lógica. Si no hay sink configurado, son no-op silenciosos.
 */

export interface ErrorSink {
  captureException(error: unknown, context?: Record<string, unknown>): void;
}

export interface AnalyticsSink {
  capture(event: string, properties?: Record<string, unknown>): void;
}

let errorSink: ErrorSink | null = null;
let analyticsSink: AnalyticsSink | null = null;

/** Conecta un proveedor de errores (p. ej. un wrapper de Sentry). */
export function registerErrorSink(sink: ErrorSink): void {
  errorSink = sink;
}

/** Conecta un proveedor de analítica (p. ej. un wrapper de PostHog). */
export function registerAnalyticsSink(sink: AnalyticsSink): void {
  analyticsSink = sink;
}

/** Reporta un error. No-op si no hay sink (no rompe el flujo del usuario). */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (errorSink) {
    errorSink.captureException(error, context);
  } else if (process.env.NODE_ENV !== "production") {
    console.error("[observability] captureError", error, context ?? {});
  }
}

/** Registra un evento de producto. No-op si no hay sink. */
export function track(event: string, properties?: Record<string, unknown>): void {
  analyticsSink?.capture(event, properties);
}
