"use client";

import * as React from "react";
import { useActionState } from "react";
import Image from "next/image";
import { CheckCircle, ImageIcon, Search, WifiOff, X } from "lucide-react";
import { Button, Card, toast } from "@arkiteq/ui";
import { PowerSyncContext } from "@powersync/react";
import type { ProductoConStock } from "@/lib/minimarket/data/inventario";
import { registrarMovimientoInventarioLocal } from "@/lib/minimarket/powersync/registrar-producto-local";
import type { TipoMovimientoInventario } from "@/lib/minimarket/inventario-calc";
import { useOnline } from "@/lib/minimarket/use-online";
import { registrarMovimiento } from "../actions";

interface Props {
  productos: ProductoConStock[];
  sucursales: { id: string; nombre: string }[];
  tenantId: string;
  usuarioId: string;
}

const TIPOS = [
  {
    value: "ajuste",
    label: "Ajuste de stock",
    desc: "Corrección positiva o negativa del conteo físico.",
    signo: "±",
  },
  {
    value: "merma",
    label: "Merma / pérdida",
    desc: "Producto dañado, vencido, perdido o robado (resta stock).",
    signo: "−",
  },
] as const;

const LABEL = "text-muted-foreground block text-xs font-medium uppercase tracking-wide";
const INPUT =
  "border-border bg-background text-heading w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-offset-1 focus:ring-accent-400";

export function AjusteForm({ productos, sucursales, tenantId, usuarioId }: Props) {
  const powerSyncDb = React.useContext(PowerSyncContext);
  const offline = !useOnline();
  const [state, action, pending] = useActionState(registrarMovimiento, {});
  const [guardandoLocal, setGuardandoLocal] = React.useState(false);
  const [okLocal, setOkLocal] = React.useState(false);

  const [sucursalId, setSucursalId] = React.useState(sucursales[0]?.id ?? "");
  const [productoId, setProductoId] = React.useState("");
  const [busqueda, setBusqueda] = React.useState("");

  const productoSeleccionado = productos.find((p) => p.id === productoId) ?? null;

  const stockEnSucursal = React.useCallback(
    (p: ProductoConStock) =>
      p.stockPorSucursal.find((s) => s.sucursal_id === sucursalId)?.stock_actual ?? p.stock_actual,
    [sucursalId],
  );

  const productosFiltrados = busqueda.trim()
    ? productos
        .filter(
          (p) =>
            p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
            (p.codigo ?? "").toLowerCase().includes(busqueda.toLowerCase()),
        )
        .slice(0, 20)
    : [];

  function seleccionarProducto(p: ProductoConStock) {
    setProductoId(p.id);
    setBusqueda("");
  }

  // Tras un envío exitoso (online u offline) se limpia la selección para que
  // el siguiente movimiento arranque sin producto elegido — el resto del
  // formulario (cantidad, motivo) sigue sin controlar, como antes.
  React.useEffect(() => {
    if (state.ok || okLocal) setProductoId("");
  }, [state.ok, okLocal]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!offline) return;
    e.preventDefault();
    setOkLocal(false);
    if (!powerSyncDb) {
      toast.error("Sin conexión y sin base local disponible. Inténtalo de nuevo en unos segundos.");
      return;
    }
    if (!productoId) {
      toast.error("Selecciona un producto.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const cantidad = Number(String(fd.get("cantidad") ?? "").replace(",", "."));
    if (!Number.isFinite(cantidad) || cantidad === 0) {
      toast.error("La cantidad no puede ser cero.");
      return;
    }
    const sucursalDestino = (fd.get("sucursal_id") as string) || sucursales[0]?.id;
    if (!sucursalDestino) {
      toast.error("No hay una sucursal configurada.");
      return;
    }
    const tipo = (fd.get("tipo") as TipoMovimientoInventario) || "ajuste";

    setGuardandoLocal(true);
    try {
      await registrarMovimientoInventarioLocal(powerSyncDb, {
        tenantId,
        usuarioId,
        sucursalId: sucursalDestino,
        productoId,
        tipo,
        cantidad,
        motivo: (fd.get("motivo") as string) || null,
      });
      toast.success("Movimiento guardado en este dispositivo. Se sincronizará al conectarte.");
      setOkLocal(true);
      e.currentTarget.reset();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `No se pudo guardar: ${err.message}`
          : "No se pudo guardar el movimiento.",
      );
    } finally {
      setGuardandoLocal(false);
    }
  }

  return (
    <Card className="space-y-5 p-6">
      <h2 className="text-heading font-medium">Registrar ajuste o merma</h2>

      {offline ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <WifiOff className="size-4 shrink-0" aria-hidden />
          <span>
            <strong>Sin conexión</strong> — se guarda en este dispositivo y se sube solo cuando
            vuelva la señal.
          </span>
        </div>
      ) : null}

      {state.ok || okLocal ? (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle className="size-4 shrink-0" />
          Movimiento registrado correctamente.
        </div>
      ) : null}

      {state.error ? <p className="text-danger text-sm">{state.error}</p> : null}

      <form action={action} onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="ajuste-producto-buscar" className={LABEL}>
              Producto <span className="text-danger">*</span>
            </label>
            <input type="hidden" name="producto_id" value={productoId} />

            {productoSeleccionado ? (
              <div className="border-border bg-surface-2 flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="bg-background relative size-9 shrink-0 overflow-hidden rounded-md">
                    {productoSeleccionado.imagen_url ? (
                      <Image
                        src={productoSeleccionado.imagen_url}
                        alt=""
                        fill
                        sizes="36px"
                        loading="lazy"
                        className="object-cover"
                      />
                    ) : (
                      <span className="text-muted-foreground/50 flex size-full items-center justify-center">
                        <ImageIcon className="size-4" aria-hidden />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 truncate text-sm">
                    <span className="text-heading font-medium">{productoSeleccionado.nombre}</span>
                    {productoSeleccionado.codigo ? (
                      <span className="text-muted-foreground ml-2 text-xs">
                        {productoSeleccionado.codigo}
                      </span>
                    ) : null}
                    <span className="text-muted-foreground ml-2 text-xs tabular-nums">
                      stock: {stockEnSucursal(productoSeleccionado)}
                    </span>
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setProductoId("")}
                  className="text-muted-foreground hover:text-danger flex size-7 shrink-0 items-center justify-center rounded transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                  <input
                    id="ajuste-producto-buscar"
                    type="text"
                    placeholder="Buscar producto por nombre o código..."
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    className={`${INPUT} pl-9`}
                  />
                </div>
                {productosFiltrados.length > 0 ? (
                  <div className="border-border max-h-56 overflow-auto rounded-md border">
                    {productosFiltrados.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => seleccionarProducto(p)}
                        className="hover:bg-surface-2 flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="bg-surface-2 relative size-9 shrink-0 overflow-hidden rounded-md">
                            {p.imagen_url ? (
                              <Image
                                src={p.imagen_url}
                                alt=""
                                fill
                                sizes="36px"
                                loading="lazy"
                                className="object-cover"
                              />
                            ) : (
                              <span className="text-muted-foreground/50 flex size-full items-center justify-center">
                                <ImageIcon className="size-4" aria-hidden />
                              </span>
                            )}
                          </span>
                          <span className="min-w-0 truncate">
                            <span className="text-heading font-medium">{p.nombre}</span>
                            {p.codigo ? (
                              <span className="text-muted-foreground ml-2 text-xs">{p.codigo}</span>
                            ) : null}
                          </span>
                        </span>
                        <span className="text-muted-foreground shrink-0 tabular-nums">
                          stock: {stockEnSucursal(p)}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : busqueda.trim() ? (
                  <p className="text-muted-foreground text-sm">No se encontraron productos.</p>
                ) : null}
              </>
            )}
            {state.fieldErrors?.producto_id ? (
              <p className="text-danger text-xs">{state.fieldErrors.producto_id}</p>
            ) : null}
          </div>

          {sucursales.length > 1 ? (
            <div className="space-y-1.5">
              <label htmlFor="ajuste-sucursal" className={LABEL}>
                Sucursal
              </label>
              <select
                id="ajuste-sucursal"
                name="sucursal_id"
                className={INPUT}
                value={sucursalId}
                onChange={(e) => setSucursalId(e.target.value)}
              >
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
          ) : sucursales[0] ? (
            <input type="hidden" name="sucursal_id" value={sucursales[0].id} />
          ) : null}
        </div>

        <fieldset className="space-y-1.5">
          <legend className={LABEL}>
            Tipo de movimiento <span className="text-danger">*</span>
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {TIPOS.map((t) => (
              <div
                key={t.value}
                className="border-border hover:bg-surface-2 has-[:checked]:border-accent-400 has-[:checked]:bg-accent-50 flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors"
              >
                <input
                  id={`ajuste-tipo-${t.value}`}
                  type="radio"
                  name="tipo"
                  value={t.value}
                  defaultChecked={t.value === "ajuste"}
                  className="accent-accent-500 mt-0.5"
                />
                <label htmlFor={`ajuste-tipo-${t.value}`} className="cursor-pointer">
                  <span className="text-heading block text-sm font-medium">
                    {t.signo} {t.label}
                  </span>
                  <span className="text-muted-foreground block text-xs">{t.desc}</span>
                </label>
              </div>
            ))}
          </div>
          {state.fieldErrors?.tipo ? (
            <p className="text-danger text-xs">{state.fieldErrors.tipo}</p>
          ) : null}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="ajuste-cantidad" className={LABEL}>
              Cantidad <span className="text-danger">*</span>
            </label>
            <p className="text-muted-foreground text-xs">
              Para ajustes: positivo suma, negativo resta. Para mermas siempre resta.
            </p>
            <input
              id="ajuste-cantidad"
              type="number"
              name="cantidad"
              required
              step="any"
              placeholder="ej. -3 o 5"
              className={INPUT}
            />
            {state.fieldErrors?.cantidad ? (
              <p className="text-danger text-xs">{state.fieldErrors.cantidad}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="ajuste-motivo" className={LABEL}>
              Motivo
            </label>
            <input
              id="ajuste-motivo"
              type="text"
              name="motivo"
              maxLength={200}
              placeholder="ej. Conteo físico, producto dañado…"
              className={INPUT}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={!productoId || pending || guardandoLocal}>
            {pending || guardandoLocal ? "Registrando…" : "Registrar movimiento"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
