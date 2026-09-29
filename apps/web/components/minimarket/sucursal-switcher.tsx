"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Store } from "lucide-react";
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
    <>
      {/* Precargador: cambiar de sucursal reescribe la cookie en el servidor y
          recarga TODOS los datos de la pantalla (inventario, caja, ventas).
          Sin esta señal el usuario no sabe si el cambio se aplicó y puede
          quedarse mirando números de la sucursal anterior. `pending` cubre
          también el `router.refresh()` porque corre dentro del transition. */}
      {pending ? (
        <div
          role="status"
          aria-live="polite"
          className="bg-background/70 fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-sm"
        >
          <div className="border-border bg-background flex items-center gap-3 rounded-xl border px-5 py-4 shadow-lg">
            <Loader2 className="text-accent-600 size-5 animate-spin" aria-hidden />
            <p className="text-heading text-sm font-medium">Cambiando de sucursal…</p>
          </div>
        </div>
      ) : null}
      <label className="text-muted-foreground flex items-center gap-2 px-2 text-xs">
        {pending ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
        ) : (
          <Store className="size-3.5 shrink-0" aria-hidden />
        )}
        <select
          value={activaId ?? ""}
          onChange={onChange}
          disabled={pending}
          aria-label="Sucursal activa"
          className="border-border bg-background focus-visible:ring-ring h-8 w-full rounded-md border px-2 text-xs focus-visible:outline-none focus-visible:ring-2 disabled:opacity-60"
        >
          {permitidas.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
