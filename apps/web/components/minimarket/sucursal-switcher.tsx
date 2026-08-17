"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Store } from "lucide-react";
import { toast } from "@arkiteq/ui";
import { cambiarSucursalActivaAction } from "@/app/(vertical)/minimarket/sucursal-actions";
import type { SucursalAcceso } from "@/lib/minimarket/sucursal-acceso";

interface SucursalSwitcherProps {
  activaId: string | null;
  permitidas: SucursalAcceso[];
}

/**
 * Selector de sucursal activa — solo se renderiza si el usuario tiene acceso
 * a 2 o más (cero fricción con 1 sola, mismo criterio que el resto del
 * sistema). Cambiar la selección actualiza la cookie en el servidor y
 * refresca, así que Inventario (y en fases futuras Ventas/Caja) ve de
 * inmediato la sucursal recién elegida.
 */
export function SucursalSwitcher({ activaId, permitidas }: SucursalSwitcherProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  if (permitidas.length <= 1) return null;

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const sucursalId = e.target.value;
    startTransition(async () => {
      const res = await cambiarSucursalActivaAction(sucursalId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <label className="text-muted-foreground flex items-center gap-2 px-2 text-xs">
      <Store className="size-3.5 shrink-0" aria-hidden />
      <select
        value={activaId ?? ""}
        onChange={onChange}
        disabled={pending}
        aria-label="Sucursal activa"
        className="border-border bg-background focus-visible:ring-ring h-8 w-full rounded-md border px-2 text-xs focus-visible:outline-none focus-visible:ring-2"
      >
        {permitidas.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre}
          </option>
        ))}
      </select>
    </label>
  );
}
