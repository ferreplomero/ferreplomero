"use client";

import * as React from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button, Card } from "@arkiteq/ui";
import { captureError } from "@arkiteq/core";

export default function TableroError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    captureError(error, { digest: error.digest, modulo: "minimarket/tablero" });
  }, [error]);

  return (
    <div className="mx-auto max-w-5xl">
      <Card className="flex flex-col items-center gap-3 p-12 text-center">
        <span className="bg-danger/12 text-danger inline-flex size-12 items-center justify-center rounded-2xl">
          <TriangleAlert className="size-6" aria-hidden />
        </span>
        <p className="text-heading font-medium">No se pudo cargar el tablero</p>
        <p className="text-muted-foreground max-w-sm text-sm">
          Hubo un error al cargar el resumen del día. Revisa tu conexión e inténtalo de nuevo.
        </p>
        <Button onClick={reset} className="mt-2">
          <RotateCcw className="size-4" />
          Reintentar
        </Button>
      </Card>
    </div>
  );
}
