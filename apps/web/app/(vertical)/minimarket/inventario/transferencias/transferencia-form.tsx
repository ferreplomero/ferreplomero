"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  AlertCircle,
  ArrowRight,
  ImageIcon,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import { Button, Card, Input, Label, toast } from "@arkiteq/ui";
import { PowerSyncContext } from "@powersync/react";
import { SubmitButton } from "@/components/auth/submit-button";
import { registrarTransferenciaLocal } from "@/lib/minimarket/powersync/registrar-transferencia-local";
import { useOnline } from "@/lib/minimarket/use-online";
import { registrarTransferencia, type TransferenciaResult } from "./actions";

interface Producto {
  id: string;
  nombre: string;
  codigo: string | null;
  imagen_url: string | null;
  stockPorSucursal: { sucursal_id: string; stock_actual: number }[];
}

interface Sucursal {
  id: string;
  nombre: string;
}

interface TransferenciaFormProps {
  productos: Producto[];
  sucursales: Sucursal[];
  tenantId: string;
  usuarioId: string;
}

interface ItemTransferencia {
  key: string;
  producto_id: string;
  nombre: string;
  cantidad: number;
}

const SELECT_CLASS =
  "border-border bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2";

let nextKey = 1;

export function TransferenciaForm({
  productos,
  sucursales,
  tenantId,
  usuarioId,
}: TransferenciaFormProps) {
  const router = useRouter();
  const powerSyncDb = React.useContext(PowerSyncContext);
  const offline = !useOnline();
  const [state, formAction] = useActionState<TransferenciaResult, FormData>(
    registrarTransferencia,
    {},
  );
  const [guardandoLocal, setGuardandoLocal] = React.useState(false);

  const [sucursalOrigenId, setSucursalOrigenId] = React.useState(sucursales[0]?.id ?? "");
  const [sucursalDestinoId, setSucursalDestinoId] = React.useState(sucursales[1]?.id ?? "");
  const [items, setItems] = React.useState<ItemTransferencia[]>([]);
  const [busqueda, setBusqueda] = React.useState("");
  const [notas, setNotas] = React.useState("");

  React.useEffect(() => {
    if (state.ok) {
      router.push("/minimarket/inventario/transferencias");
    }
  }, [state.ok, router]);

  const stockEnOrigen = React.useCallback(
    (productoId: string) => {
      const producto = productos.find((p) => p.id === productoId);
      return (
        producto?.stockPorSucursal.find((s) => s.sucursal_id === sucursalOrigenId)?.stock_actual ??
        0
      );
    },
    [productos, sucursalOrigenId],
  );

  const itemsConExceso = items.filter((i) => i.cantidad > stockEnOrigen(i.producto_id));
  const puedeEnviar =
    items.length > 0 &&
    sucursalOrigenId &&
    sucursalDestinoId &&
    sucursalOrigenId !== sucursalDestinoId &&
    itemsConExceso.length === 0;

  const productosFiltrados = busqueda.trim()
    ? productos.filter(
        (p) =>
          p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
          (p.codigo ?? "").toLowerCase().includes(busqueda.toLowerCase()),
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
        { key: String(nextKey++), producto_id: p.id, nombre: p.nombre, cantidad: 1 },
      ]);
    }
    setBusqueda("");
  }

  function actualizarCantidad(key: string, cantidad: number) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, cantidad } : i)));
  }

  function quitarItem(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!offline) return;
    e.preventDefault();
    if (!powerSyncDb) {
      toast.error("Sin conexión y sin base local disponible. Inténtalo de nuevo en unos segundos.");
      return;
    }
    if (!puedeEnviar) return;

    setGuardandoLocal(true);
    try {
      await registrarTransferenciaLocal(powerSyncDb, {
        tenantId,
        usuarioId,
        sucursalOrigenId,
        sucursalDestinoId,
        notas: notas.trim() || null,
        items: items.map((i) => ({ productoId: i.producto_id, cantidad: i.cantidad })),
      });
      toast.success("Transferencia guardada en este dispositivo. Se sincronizará al conectarte.");
      setItems([]);
      setNotas("");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `No se pudo guardar: ${err.message}`
          : "No se pudo guardar la transferencia.",
      );
    } finally {
      setGuardandoLocal(false);
    }
  }

  return (
    <div className="space-y-6">
      {offline ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <WifiOff className="size-4 shrink-0" aria-hidden />
          <span>
            <strong>Sin conexión</strong> — la transferencia se guarda en este dispositivo y se sube
            sola cuando vuelva la señal.
          </span>
        </div>
      ) : null}

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
          fd.set(
            "items_json",
            JSON.stringify(
              items.map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad })),
            ),
          );
          formAction(fd);
        }}
        onSubmit={onSubmit}
        className="space-y-6"
        noValidate
      >
        <Card className="space-y-4 p-5">
          <h3 className="text-heading font-medium">Origen y destino</h3>
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <div className="w-full space-y-1.5">
              <Label htmlFor="sucursal_origen_id">
                Sucursal origen <span className="text-danger">*</span>
              </Label>
              <select
                id="sucursal_origen_id"
                name="sucursal_origen_id"
                className={SELECT_CLASS}
                value={sucursalOrigenId}
                onChange={(e) => setSucursalOrigenId(e.target.value)}
                required
              >
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
            <ArrowRight className="text-muted-foreground mt-6 hidden size-5 shrink-0 sm:block" />
            <div className="w-full space-y-1.5">
              <Label htmlFor="sucursal_destino_id">
                Sucursal destino <span className="text-danger">*</span>
              </Label>
              <select
                id="sucursal_destino_id"
                name="sucursal_destino_id"
                className={SELECT_CLASS}
                value={sucursalDestinoId}
                onChange={(e) => setSucursalDestinoId(e.target.value)}
                required
              >
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {sucursalOrigenId && sucursalOrigenId === sucursalDestinoId ? (
            <p className="text-danger text-xs">El origen y el destino deben ser distintos.</p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="notas">Notas (opcional)</Label>
            <Input
              id="notas"
              name="notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              maxLength={200}
              placeholder="ej. Reposición de fin de semana"
            />
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <h3 className="text-heading font-medium">Productos a transferir</h3>

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
              {productosFiltrados.slice(0, 20).map((p) => {
                const disponible =
                  p.stockPorSucursal.find((s) => s.sucursal_id === sucursalOrigenId)
                    ?.stock_actual ?? 0;
                return (
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
                      disponible {disponible}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : busqueda.trim() ? (
            <p className="text-muted-foreground text-sm">No se encontraron productos.</p>
          ) : null}

          {items.length > 0 ? (
            <div className="space-y-2">
              <div className="text-muted-foreground hidden grid-cols-[1fr_120px_32px] gap-2 px-1 text-xs uppercase tracking-wide sm:grid">
                <span>Producto</span>
                <span className="text-right">Cantidad</span>
                <span />
              </div>
              {items.map((item) => {
                const disponible = stockEnOrigen(item.producto_id);
                const excedido = item.cantidad > disponible;
                return (
                  <div key={item.key} className="space-y-1">
                    <div className="bg-surface-2 grid grid-cols-2 items-center gap-2 rounded-lg px-3 py-2 sm:grid-cols-[1fr_120px_32px]">
                      <div className="col-span-2 min-w-0 sm:col-span-1">
                        <p className="text-heading truncate text-sm font-medium">{item.nombre}</p>
                        <p className="text-muted-foreground text-xs tabular-nums">
                          Disponible en origen: {disponible}
                        </p>
                      </div>
                      <Input
                        type="number"
                        step="0.001"
                        min="0.001"
                        value={item.cantidad}
                        onChange={(e) =>
                          actualizarCantidad(item.key, parseFloat(e.target.value) || 0)
                        }
                        className="h-8 text-right text-sm"
                        aria-invalid={excedido}
                      />
                      <button
                        type="button"
                        onClick={() => quitarItem(item.key)}
                        className="text-muted-foreground hover:text-danger flex size-8 items-center justify-center rounded transition-colors"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    {excedido ? (
                      <p className="text-danger flex items-center gap-1 text-xs">
                        <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                        Supera el stock disponible en la sucursal origen ({disponible}).
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="border-border rounded-lg border border-dashed py-8 text-center">
              <Plus className="text-muted-foreground mx-auto mb-2 size-8" />
              <p className="text-muted-foreground text-sm">
                Busca y agrega los productos a transferir.
              </p>
            </div>
          )}
        </Card>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            className="w-full sm:w-auto"
          >
            Cancelar
          </Button>
          <SubmitButton disabled={!puedeEnviar || guardandoLocal} className="w-full sm:w-auto">
            {guardandoLocal ? "Guardando…" : "Registrar transferencia"}
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
