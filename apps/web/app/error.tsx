"use client";

import * as React from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@arkiteq/ui";
import { captureError } from "@arkiteq/core";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    captureError(error, { digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 text-center">
      <h1 className="font-display text-heading text-2xl font-semibold">Algo salió mal</h1>
      <p className="text-muted-foreground mt-2 max-w-sm">
        Tuvimos un problema inesperado. Puedes intentarlo de nuevo.
      </p>
      <Button onClick={reset} className="mt-8">
        <RotateCcw className="size-4" />
        Reintentar
      </Button>
    </div>
  );
}
