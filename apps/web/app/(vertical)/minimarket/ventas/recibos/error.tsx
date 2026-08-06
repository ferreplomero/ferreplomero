"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@arkiteq/ui";

export default function RecibosError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <AlertCircle className="text-danger size-10" aria-hidden />
      <div>
        <p className="text-heading font-medium">No se pudieron cargar los recibos</p>
        <p className="text-muted-foreground mt-1 text-sm">{error.message}</p>
      </div>
      <Button onClick={reset}>Reintentar</Button>
    </div>
  );
}
