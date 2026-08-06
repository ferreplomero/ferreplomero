"use client";

import * as React from "react";
import { XCircle } from "lucide-react";
import { Button } from "@arkiteq/ui";
import { AnularVentaDialog } from "./anular-venta-dialog";

interface BotonAnularProps {
  ventaId: string;
}

export function BotonAnular({ ventaId }: BotonAnularProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-danger hover:border-danger/40 hover:text-danger"
      >
        <XCircle className="mr-1.5 size-4" />
        Anular
      </Button>
      <AnularVentaDialog ventaId={ventaId} open={open} onOpenChange={setOpen} />
    </>
  );
}
