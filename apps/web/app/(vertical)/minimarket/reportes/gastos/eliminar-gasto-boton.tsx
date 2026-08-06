"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { eliminarGastoOperativo } from "./actions";

export function EliminarGastoBoton({
  gastoId,
  descripcion,
}: {
  gastoId: string;
  descripcion: string;
}) {
  const router = useRouter();
  const [eliminando, setEliminando] = React.useState(false);

  async function onClick() {
    if (!confirm(`¿Eliminar el gasto "${descripcion}"? Esta acción no se puede deshacer.`)) return;
    setEliminando(true);
    const fd = new FormData();
    fd.set("id", gastoId);
    const result = await eliminarGastoOperativo(fd);
    setEliminando(false);
    if (result.error) {
      alert(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={eliminando}
      className="text-danger/70 hover:text-danger text-xs disabled:opacity-50"
    >
      {eliminando ? "Eliminando…" : "Eliminar"}
    </button>
  );
}
