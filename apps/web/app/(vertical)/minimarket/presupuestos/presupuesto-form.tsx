"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AlertCircle, ImageIcon, Plus, Search, Trash2, User, X } from "lucide-react";
import { Button, Card, Input, Label, toast } from "@arkiteq/ui";
import { SubmitButton } from "@/components/auth/submit-button";
import { CampoMontoDual } from "@/components/minimarket/shared/campo-monto-dual";
import type { PresupuestoDetalle } from "@/lib/minimarket/data/presupuestos";
import type { PresupuestoResult } from "./actions";

/** Prefijo fijo de todo número de presupuesto (ver `PREFIJO_NUMERO_PRESUPUESTO`
 * en `lib/minimarket/data/presupuestos.ts`) — solo la parte numérica es
 * editable, para no abrir la puerta a formatos arbitrarios que romperían el
 * cálculo de "siguiente número". */
const PREFIJO_NUMERO = "P-";

interface Producto {
  id: string;
  nombre: string;
  codigo: string | null;
  precio_usd: number;
  imagen_url: string | null;
}

interface Cliente {
  id: string;
  nombre: string;
  cedula: string | null;
  telefono: string | null;
}

interface Sucursal {
  id: string;
  nombre: string;
}

interface ItemPresupuesto {
  key: string;
  producto_id: string;
  nombre: string;
  cantidad: number;
  precio_lista_usd: number;
  precio_unitario_usd: number;
}

interface PresupuestoFormProps {
  productos: Producto[];
  clientes: Cliente[];
  sucursales: Sucursal[];
  tasa: number;
  locale: string;
  ivaActivo: boolean;
  ivaPct: number;
  action: (prev: PresupuestoResult, formData: FormData) => Promise<PresupuestoResult>;
  volverA: string;
  presupuesto?: PresupuestoDetalle | null;
  /** Número sugerido para un presupuesto NUEVO (ej. "P-000046") — el mayor
   * número ya asignado al tenant + 1. Solo aplica al crear; al editar un
   * presupuesto existente su número ya no se muestra ni se puede cambiar. */
  numeroSugerido?: string;
}

const SELECT_CLASS =
  "border-border bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2";

function validezPorDefecto(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

let nextKey = 1;

export function PresupuestoForm({
  productos,
  clientes,
  sucursales,
  tasa,
  locale,
  ivaActivo,
  ivaPct,
  action,
  volverA,
  presupuesto,
  numeroSugerido,
}: PresupuestoFormProps) {
  const router = useRouter();
  const [state, formAction] = useActionState<PresupuestoResult, FormData>(action, {});

  // Número editable (solo al crear): el usuario ve el número que se le
  // asignaría y puede ajustar la parte numérica — por ejemplo para continuar
  // una numeración que ya traía de otro sistema. El prefijo "P-" es fijo.
  const digitosSugeridos = React.useMemo(() => {
    const m = /^P-(\d+)$/.exec(numeroSugerido ?? "");
    return m?.[1] ?? "1";
  }, [numeroSugerido]);
  const [numeroDigitos, setNumeroDigitos] = React.useState(digitosSugeridos);
  const numeroCompleto = `${PREFIJO_NUMERO}${numeroDigitos.padStart(6, "0")}`;
  const ultimoNumeroUsado = Math.max(0, parseInt(digitosSugeridos, 10) - 1);
  const numeroDigitosValor = parseInt(numeroDigitos || "0", 10);
  const avisoNumeroMenor =
    !presupuesto && ultimoNumeroUsado > 0 && numeroDigitosValor <= ultimoNumeroUsado;

  const [items, setItems] = React.useState<ItemPresupuesto[]>(
    presupuesto
      ? presupuesto.items.map((i) => ({
          key: String(nextKey++),
          producto_id: i.productoId,
          nombre: i.descripcion,
          cantidad: i.cantidad,
          precio_lista_usd: i.precioListaUsd,
          precio_unitario_usd: i.precioUnitarioUsd,
        }))
      : [],
  );
  const [busqueda, setBusqueda] = React.useState("");

  const [clienteId, setClienteId] = React.useState<string | null>(presupuesto?.clienteId ?? null);
  const [clienteQuery, setClienteQuery] = React.useState("");
  const [clienteNombreManual, setClienteNombreManual] = React.useState(
    presupuesto?.clienteNombreManual ?? "",
  );
  const [clienteCedulaManual, setClienteCedulaManual] = React.useState(
    presupuesto?.clienteCedulaManual ?? "",
  );
  const [clienteTelefonoManual, setClienteTelefonoManual] = React.useState(
    presupuesto?.clienteTelefonoManual ?? "",
  );
  const clienteSeleccionado = clienteId ? (clientes.find((c) => c.id === clienteId) ?? null) : null;

  const [validezHasta, setValidezHasta] = React.useState(
    presupuesto?.validezHasta ?? validezPorDefecto(),
  );
  const [notas, setNotas] = React.useState(presupuesto?.notas ?? "");

  React.useEffect(() => {
    if (state.ok && state.presupuestoId) {
      toast.success(presupuesto ? "Presupuesto actualizado." : "Presupuesto creado.");
      router.push(`/minimarket/presupuestos/${state.presupuestoId}`);
    }
  }, [state.ok, state.presupuestoId, presupuesto, router]);

  const usd = (v: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(v);
  const bs = (v: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "VES" }).format(v);

  const subtotalUsd = items.reduce((s, i) => s + i.cantidad * i.precio_unitario_usd, 0);
  const ivaUsd = ivaActivo && ivaPct > 0 ? (subtotalUsd * ivaPct) / 100 : 0;
  const totalUsd = subtotalUsd + ivaUsd;
  const totalBs = totalUsd * tasa;

  const productosFiltrados = busqueda.trim()
    ? productos.filter(
        (p) =>
          p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
          (p.codigo ?? "").toLowerCase().includes(busqueda.toLowerCase()),
      )
    : [];

  const clientesFiltrados = clienteQuery.trim()
    ? clientes.filter(
        (c) =>
          c.nombre.toLowerCase().includes(clienteQuery.toLowerCase()) ||
          (c.cedula ?? "").toLowerCase().includes(clienteQuery.toLowerCase()),
      )
    : [];

  function agregarProducto(p: Producto) {
    const yaExiste = items.find((i) => i.producto_id === p.id);
    if (yaExiste) {
      setItems((prev) =>
        prev.map((i) => (i.producto_id === p.id ? { ...i, cantidad: i.cantidad + 1 } : i)),
      );
    } else {
      setItems((prev) => [
        ...prev,
        {
          key: String(nextKey++),
          producto_id: p.id,
          nombre: p.nombre,
          cantidad: 1,
          precio_lista_usd: p.precio_usd,
          precio_unitario_usd: p.precio_usd,
        },
      ]);
    }
    setBusqueda("");
  }

  function actualizarCantidad(key: string, cantidad: number) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, cantidad } : i)));
  }

  function actualizarPrecio(key: string, precio: number) {
    setItems((prev) =>
      prev.map((i) => (i.key === key ? { ...i, precio_unitario_usd: precio } : i)),
    );
  }

  function quitarItem(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  return (
    <div className="space-y-6">
      {state.error ? (
        <p
          role="alert"
          className="bg-danger/10 text-danger flex items-center gap-2 rounded-md px-3 py-2.5 text-sm"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}

      <form
        action={(fd) => {
          fd.set("items_json", JSON.stringify(items));
          fd.set("cliente_id", clienteId ?? "");
          fd.set("cliente_nombre_manual", clienteId ? "" : clienteNombreManual);
          fd.set("cliente_cedula_manual", clienteId ? "" : clienteCedulaManual);
          fd.set("cliente_telefono_manual", clienteId ? "" : clienteTelefonoManual);
          if (!presupuesto) fd.set("numero", numeroCompleto);
          formAction(fd);
        }}
        className="space-y-6"
        noValidate
      >
        {/* Cliente */}
        <Card className="space-y-4 p-5">
          <h3 className="text-heading font-medium">Cliente</h3>

          {clienteSeleccionado ? (
            <div className="bg-surface-2 flex items-center justify-between gap-2 rounded-lg px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <User className="text-muted-foreground size-4 shrink-0" aria-hidden />
                <div className="min-w-0">
                  <p className="text-heading truncate text-sm font-medium">
                    {clienteSeleccionado.nombre}
                  </p>
                  {clienteSeleccionado.cedula ? (
                    <p className="text-muted-foreground text-xs">{clienteSeleccionado.cedula}</p>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setClienteId(null)}
                className="text-muted-foreground hover:text-danger flex size-8 shrink-0 items-center justify-center rounded transition-colors"
                aria-label="Quitar cliente"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                <Input
                  placeholder="Buscar cliente existente por nombre o cédula..."
                  value={clienteQuery}
                  onChange={(e) => setClienteQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              {clientesFiltrados.length > 0 ? (
                <div className="border-border max-h-40 overflow-auto rounded-md border">
                  {clientesFiltrados.slice(0, 15).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setClienteId(c.id);
                        setClienteQuery("");
                      }}
                      className="hover:bg-surface-2 flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors"
                    >
                      <span className="text-heading font-medium">{c.nombre}</span>
                      {c.cedula ? (
                        <span className="text-muted-foreground text-xs">{c.cedula}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}

              <p className="text-muted-foreground text-xs">
                O ingresa los datos del cliente directamente (no crea una ficha en Clientes):
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cliente-nombre-manual">Nombre</Label>
                  <Input
                    id="cliente-nombre-manual"
                    value={clienteNombreManual}
                    onChange={(e) => setClienteNombreManual(e.target.value)}
                    placeholder="María González"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cliente-cedula-manual">Cédula / RIF</Label>
                  <Input
                    id="cliente-cedula-manual"
                    value={clienteCedulaManual}
                    onChange={(e) => setClienteCedulaManual(e.target.value)}
                    placeholder="V-12345678"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cliente-telefono-manual">Teléfono</Label>
                  <Input
                    id="cliente-telefono-manual"
                    type="tel"
                    value={clienteTelefonoManual}
                    onChange={(e) => setClienteTelefonoManual(e.target.value)}
                    placeholder="0412-1234567"
                  />
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Datos del presupuesto */}
        <Card className="space-y-4 p-5">
          <h3 className="text-heading font-medium">Datos del presupuesto</h3>

          {!presupuesto ? (
            <div className="space-y-1.5">
              <Label htmlFor="numero_digitos">Número de presupuesto</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm font-medium">{PREFIJO_NUMERO}</span>
                <Input
                  id="numero_digitos"
                  inputMode="numeric"
                  value={numeroDigitos}
                  onChange={(e) => setNumeroDigitos(e.target.value.replace(/\D/g, "").slice(0, 12))}
                  className="max-w-32 tabular-nums"
                />
              </div>
              <p className="text-muted-foreground text-xs">
                Se asignará como <span className="text-heading font-medium">{numeroCompleto}</span>.
                Puedes dejarlo así (sigue tu numeración automática) o escribir otro — por ejemplo si
                vienes de otro sistema y quieres continuar su numeración.
              </p>
              {avisoNumeroMenor ? (
                <p className="text-warning text-xs">
                  El último número usado fue {PREFIJO_NUMERO}
                  {String(ultimoNumeroUsado).padStart(6, "0")}. Puedes continuar, pero el siguiente
                  presupuesto después de este seguirá siendo {numeroSugerido}.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sucursal_id">
                Sucursal <span className="text-danger">*</span>
              </Label>
              <select
                id="sucursal_id"
                name="sucursal_id"
                className={SELECT_CLASS}
                defaultValue={presupuesto?.sucursalId ?? sucursales[0]?.id}
                required
              >
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="validez_hasta">
                Válido hasta <span className="text-danger">*</span>
              </Label>
              <Input
                id="validez_hasta"
                type="date"
                value={validezHasta}
                onChange={(e) => setValidezHasta(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notas">Notas (opcional)</Label>
            <textarea
              id="notas"
              name="notas"
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Condiciones, observaciones..."
              className="border-border bg-background focus-visible:ring-ring w-full resize-none rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
            />
          </div>
          <input type="hidden" name="validez_hasta" value={validezHasta} />
        </Card>

        {/* Productos con precio editable */}
        <Card className="space-y-4 p-5">
          <h3 className="text-heading font-medium">Productos</h3>
          <p className="text-muted-foreground text-sm">
            El precio se prellena con el precio normal del producto — puedes ajustarlo libremente
            para este presupuesto (mayorista o el que decidas) sin cambiar el precio del inventario.
          </p>

          <div className="relative">
            <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              placeholder="Buscar producto por nombre o código..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="pl-9"
            />
          </div>

          {productosFiltrados.length > 0 ? (
            <div className="border-border max-h-56 overflow-auto rounded-md border">
              {productosFiltrados.slice(0, 20).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => agregarProducto(p)}
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
                    {usd(p.precio_usd)}
                  </span>
                </button>
              ))}
            </div>
          ) : busqueda.trim() ? (
            <p className="text-muted-foreground text-sm">No se encontraron productos.</p>
          ) : null}

          {items.length > 0 ? (
            <div className="space-y-2">
              {items.map((item) => {
                const ajustado = Math.abs(item.precio_unitario_usd - item.precio_lista_usd) > 0.001;
                return (
                  <div key={item.key} className="bg-surface-2 space-y-2 rounded-lg px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-heading truncate text-sm font-medium">{item.nombre}</p>
                        <p className="text-muted-foreground text-xs tabular-nums">
                          Precio normal: {usd(item.precio_lista_usd)}
                          {ajustado ? " · precio ajustado" : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => quitarItem(item.key)}
                        className="text-muted-foreground hover:text-danger flex size-8 shrink-0 items-center justify-center rounded transition-colors"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-[110px_1fr_100px]">
                      <div className="space-y-1">
                        <p className="text-muted-foreground text-[11px] uppercase tracking-wide">
                          Cantidad
                        </p>
                        <Input
                          type="number"
                          step="0.001"
                          min="0.001"
                          value={item.cantidad}
                          onChange={(e) =>
                            actualizarCantidad(item.key, parseFloat(e.target.value) || 0)
                          }
                          className="h-9 text-right text-sm"
                        />
                      </div>
                      <div>
                        <CampoMontoDual
                          id={`precio-${item.key}`}
                          label="Precio unitario"
                          name={`precio_unitario_usd_${item.key}`}
                          valorUsd={item.precio_unitario_usd.toFixed(2)}
                          onChangeUsd={(v) => actualizarPrecio(item.key, Number(v) || 0)}
                          tasa={tasa}
                          compact
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-muted-foreground text-[11px] uppercase tracking-wide">
                          Subtotal
                        </p>
                        <p className="text-heading pt-2 text-right text-sm font-medium tabular-nums">
                          {usd(item.cantidad * item.precio_unitario_usd)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="border-border mt-3 space-y-1.5 border-t pt-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Subtotal ({items.length} producto{items.length !== 1 ? "s" : ""})
                  </span>
                  <span className="text-heading tabular-nums">{usd(subtotalUsd)}</span>
                </div>
                {ivaActivo ? (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">IVA ({ivaPct} %)</span>
                    <span className="text-muted-foreground tabular-nums">{usd(ivaUsd)}</span>
                  </div>
                ) : null}
                <div className="border-border flex items-center justify-between border-t pt-1.5">
                  <span className="text-heading font-medium">Total</span>
                  <div className="text-right">
                    <p className="text-heading font-display text-lg font-semibold tabular-nums">
                      {usd(totalUsd)}
                    </p>
                    <p className="text-muted-foreground text-xs tabular-nums">{bs(totalBs)}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="border-border rounded-lg border border-dashed py-8 text-center">
              <Plus className="text-muted-foreground mx-auto mb-2 size-8" />
              <p className="text-muted-foreground text-sm">
                Busca y agrega los productos de este presupuesto.
              </p>
            </div>
          )}
        </Card>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(volverA)}
            className="w-full sm:w-auto"
          >
            Cancelar
          </Button>
          <SubmitButton disabled={items.length === 0} className="w-full sm:w-auto">
            {presupuesto ? "Guardar cambios" : "Crear presupuesto"}
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
