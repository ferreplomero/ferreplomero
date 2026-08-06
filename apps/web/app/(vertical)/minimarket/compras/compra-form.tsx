"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  AlertCircle,
  ImageIcon,
  Info,
  Plus,
  Search,
  Trash2,
  UserPlus,
  WifiOff,
} from "lucide-react";
import { Button, Card, cn, Dialog, DialogContent, Input, Label, toast } from "@arkiteq/ui";
import { PowerSyncContext } from "@powersync/react";
import { SubmitButton } from "@/components/auth/submit-button";
import { registrarCompraLocal } from "@/lib/minimarket/powersync/registrar-compra-local";
import { useOnline } from "@/lib/minimarket/use-online";
import { CampoMontoDual } from "@/components/minimarket/shared/campo-monto-dual";
import { IGTF_RATE, causaIgtf, METODOS_COMPRA } from "@/lib/minimarket/constants";
import { medianocheLocalAUtcISO } from "@/lib/minimarket/date-format";
import { esEfectivo } from "@/lib/minimarket/pos-calc";
import { esMetodoConCuenta } from "@/lib/minimarket/bancos";
import { getCuentaPredeterminada } from "@/lib/minimarket/data/bancos";
import type { MetodoPagoConfigItem } from "@/lib/minimarket/metodos-pago";
import type { MmCuentaBancaria, MmMetodoPago } from "@arkiteq/db";
import type { OpcionImpuesto } from "@/lib/minimarket/producto-opciones";
import { ProductoForm } from "@/components/minimarket/inventario/producto-form-cargador";
import { ProveedorForm } from "../proveedores/proveedor-form";
import { crearCompra, crearProveedor, type CompraResult } from "./actions";

interface Producto {
  id: string;
  nombre: string;
  codigo: string | null;
  costo_usd: number;
  imagen_url: string | null;
}

interface Proveedor {
  id: string;
  nombre: string;
}

interface Sucursal {
  id: string;
  nombre: string;
}

interface CompraFormProps {
  productos: Producto[];
  proveedores: Proveedor[];
  sucursales: Sucursal[];
  tasa: number;
  locale: string;
  tenantId: string;
  usuarioId: string;
  ivaActivo: boolean;
  ivaPct: number;
  igtfActivo: boolean;
  /** Zona horaria del negocio (ej. "America/Caracas"), para anclar la fecha
   * elegida a la medianoche local correcta antes de guardarla. */
  tz: string;
  /** Necesarios solo para reutilizar el modal de alta de producto (Inventario)
   * desde "+ Nuevo producto" sin salir de la compra. */
  categorias: { id: string; nombre: string }[];
  impuestos: OpcionImpuesto[];
  impuestoIdDefault: string;
  aplicaIgtfDefault: boolean;
  margenGlobalActivo: boolean;
  margenGlobalPct: number | null;
  skuSugerido: number;
  /** Métodos de pago activos en Configuración — el selector solo muestra estos
   * (más "credito_proveedor", siempre disponible, ver constants.ts). */
  metodosPago: MetodoPagoConfigItem[];
  /** ¿Hay una caja abierta ahora mismo? Solo afecta el aviso al elegir efectivo. */
  cajaAbierta: boolean;
  /** Cuentas bancarias activas del tenant, para elegir de cuál sale el dinero
   * cuando el método es digital (pago móvil/transferencia/Zelle/tarjeta). */
  cuentasBancarias: MmCuentaBancaria[];
}

interface ItemCompra {
  key: string;
  producto_id: string;
  nombre: string;
  cantidad: number;
  costo_unitario_usd: number;
  /** Costo que el producto tenía en inventario al agregarlo al carrito —
   * snapshot inmutable, nunca cambia después. Sirve solo para detectar y
   * mostrar el aviso de "el costo cambió"; el servidor vuelve a comparar
   * contra el costo REAL y actual del producto antes de aplicar nada. */
  costo_inventario_actual: number;
  /** Decisión del usuario cuando el costo cambió: actualizar costo/precio de
   * venta en inventario, o mantenerlos y que esta compra solo registre su
   * costo real pagado. Por defecto `false` (Mantener) — nunca se cambia el
   * inventario sin que el usuario lo elija explícitamente. */
  actualizar_costo: boolean;
}

/** ¿El costo tecleado en esta compra difiere del que el producto tenía en inventario? */
function tieneCambioCosto(item: ItemCompra): boolean {
  return Math.abs(item.costo_unitario_usd - item.costo_inventario_actual) > 0.001;
}

const SELECT_CLASS =
  "border-border bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2";

const hoy = () => new Date().toISOString().slice(0, 10);

let nextKey = 1;

export function CompraForm({
  productos: productosIniciales,
  proveedores: proveedoresIniciales,
  sucursales,
  tasa,
  locale,
  tenantId,
  usuarioId,
  ivaActivo,
  ivaPct,
  igtfActivo,
  tz,
  categorias,
  impuestos,
  impuestoIdDefault,
  aplicaIgtfDefault,
  margenGlobalActivo,
  margenGlobalPct,
  skuSugerido,
  metodosPago,
  cajaAbierta,
  cuentasBancarias,
}: CompraFormProps) {
  const router = useRouter();
  const powerSyncDb = React.useContext(PowerSyncContext);
  const offline = !useOnline();
  const [state, formAction] = useActionState<CompraResult, FormData>(crearCompra, {});
  const [items, setItems] = React.useState<ItemCompra[]>([]);
  const [busqueda, setBusqueda] = React.useState("");
  const [guardandoLocal, setGuardandoLocal] = React.useState(false);
  const [cuentaBancariaId, setCuentaBancariaId] = React.useState("");

  // Métodos activos en Configuración + "credito_proveedor", siempre
  // disponible (mismo criterio que "credito_cliente" en ventas: no es un
  // medio que el negocio active/desactive, ver migración 0086).
  const metodosActivos = React.useMemo(() => {
    const activosSet = new Set<MmMetodoPago>(
      metodosPago.filter((m) => m.activo).map((m) => m.metodo),
    );
    return METODOS_COMPRA.filter((m) => m.value === "credito_proveedor" || activosSet.has(m.value));
  }, [metodosPago]);

  const metodoInicial: MmMetodoPago =
    metodosActivos.find((m) => m.value === "efectivo_bs")?.value ??
    metodosActivos[0]?.value ??
    "efectivo_bs";
  const [metodoPago, setMetodoPago] = React.useState<MmMetodoPago>(metodoInicial);

  // Cuenta bancaria de la que sale el dinero de una compra digital — mismo
  // patrón que gasto-form.tsx: se resetea al cambiar de método, se muestra un
  // selector solo si hay más de una cuenta activa para ese método.
  React.useEffect(() => {
    setCuentaBancariaId("");
  }, [metodoPago]);
  const cuentasDelMetodo = React.useMemo(
    () => cuentasBancarias.filter((c) => c.metodo === metodoPago && c.activa),
    [cuentasBancarias, metodoPago],
  );
  const cuentaPredeterminada = esMetodoConCuenta(metodoPago)
    ? getCuentaPredeterminada(cuentasBancarias, metodoPago)
    : null;
  const cuentaResueltaId = cuentaBancariaId || cuentaPredeterminada?.id || "";
  const cuentaResuelta =
    cuentasDelMetodo.find((c) => c.id === cuentaResueltaId) ?? cuentaPredeterminada;
  const faltaCuentaDigital = esMetodoConCuenta(metodoPago) && !cuentaResuelta;

  // Productos/proveedores mutables: además de lo que trae el servidor, incluye
  // los creados EN VIVO desde esta misma compra ("+ Nuevo producto"/"+ Nuevo
  // proveedor"), para que aparezcan y queden seleccionables sin recargar.
  const [productos, setProductos] = React.useState<Producto[]>(productosIniciales);
  const [proveedores, setProveedores] = React.useState<Proveedor[]>(proveedoresIniciales);
  const [proveedorId, setProveedorId] = React.useState("");
  const [productoModalOpen, setProductoModalOpen] = React.useState(false);
  const [proveedorModalOpen, setProveedorModalOpen] = React.useState(false);

  React.useEffect(() => {
    if (state.ok && state.compraId) {
      router.push(`/minimarket/compras/${state.compraId}`);
    }
  }, [state.ok, state.compraId, router]);

  /**
   * Sin conexión: escribe directo en local (PowerSync) — no navega al detalle
   * de la compra (Server Component, necesita red), igual que la venta offline.
   */
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!offline) return;
    e.preventDefault();
    if (!powerSyncDb) {
      toast.error("Sin conexión y sin base local disponible. Inténtalo de nuevo en unos segundos.");
      return;
    }
    if (items.length === 0) return;

    const fd = new FormData(e.currentTarget);
    const sucursalId = String(fd.get("sucursal_id") ?? "");
    if (!sucursalId) {
      toast.error("Selecciona una sucursal.");
      return;
    }
    const estado = fd.get("estado") === "recibida" ? "recibida" : "borrador";
    const notas = String(fd.get("notas") ?? "").trim();

    setGuardandoLocal(true);
    try {
      await registrarCompraLocal(powerSyncDb, {
        tenantId,
        usuarioId,
        proveedorId: (fd.get("proveedor_id") as string) || null,
        sucursalId,
        fecha: medianocheLocalAUtcISO(String(fd.get("fecha") ?? hoy()), tz),
        estado,
        notas: notas || null,
        items: items.map((i) => ({
          productoId: i.producto_id,
          cantidad: i.cantidad,
          costoUnitarioUsd: i.costo_unitario_usd,
          actualizarCosto: i.actualizar_costo,
        })),
      });
      toast.success("Compra guardada en este dispositivo. Se sincronizará al conectarte.");
      setItems([]);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `No se pudo guardar: ${err.message}`
          : "No se pudo guardar la compra.",
      );
    } finally {
      setGuardandoLocal(false);
    }
  }

  const usd = (v: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(v);
  const bs = (v: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "VES" }).format(v);

  const totalUsd = items.reduce((s, i) => s + i.cantidad * i.costo_unitario_usd, 0);
  const totalBs = totalUsd * tasa;

  // Preview de control interno (Finanzas) — el monto real y congelado se
  // calcula igual en el servidor al registrar la compra (crearCompra).
  const ivaEstimadoUsd = ivaActivo && ivaPct > 0 ? (totalUsd * ivaPct) / 100 : 0;
  const igtfEstimadoUsd =
    igtfActivo && causaIgtf(metodoPago) ? (totalUsd + ivaEstimadoUsd) * IGTF_RATE : 0;
  const totalPagadoUsd = totalUsd + ivaEstimadoUsd + igtfEstimadoUsd;

  const itemsConCambio = items.filter(tieneCambioCosto);

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
        {
          key: String(nextKey++),
          producto_id: p.id,
          nombre: p.nombre,
          cantidad: 1,
          costo_unitario_usd: p.costo_usd,
          costo_inventario_actual: p.costo_usd,
          actualizar_costo: false,
        },
      ]);
    }
    setBusqueda("");
  }

  /** "+ Nuevo producto": el producto ya quedó guardado en inventario (lo hizo
   * `ProductoForm` reutilizado tal cual); aquí solo lo sumamos a la lista
   * local de búsqueda y lo agregamos de inmediato a esta compra. */
  function onProductoCreado(creado?: {
    id: string;
    nombre: string;
    costoUsd: number;
    imagenUrl: string | null;
  }) {
    setProductoModalOpen(false);
    if (!creado) return;
    const nuevo: Producto = {
      id: creado.id,
      nombre: creado.nombre,
      codigo: null,
      costo_usd: creado.costoUsd,
      imagen_url: creado.imagenUrl,
    };
    setProductos((prev) => [nuevo, ...prev]);
    agregarProducto(nuevo);
    toast.success(`"${creado.nombre}" se creó y se agregó a la compra.`);
  }

  /** "+ Nuevo proveedor": el proveedor ya quedó guardado (lo hizo
   * `ProveedorForm` reutilizado tal cual); aquí solo lo sumamos a la lista
   * local y lo dejamos seleccionado en el selector de esta compra. */
  function onProveedorCreado(creado: { id: string; nombre: string }) {
    setProveedorModalOpen(false);
    setProveedores((prev) =>
      [...prev, creado].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    );
    setProveedorId(creado.id);
    toast.success(`Proveedor "${creado.nombre}" creado y seleccionado.`);
  }

  function actualizarItem(key: string, campo: "cantidad" | "costo_unitario_usd", valor: number) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, [campo]: valor } : i)));
  }

  /** Decisión del usuario para un ítem con costo cambiado: "Actualizar" (true) o "Mantener" (false). */
  function setActualizarCosto(key: string, valor: boolean) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, actualizar_costo: valor } : i)));
  }

  /** Botones "Actualizar todos"/"Mantener todos" del resumen — solo afecta a
   * los ítems que de verdad tienen un cambio de costo detectado. */
  function marcarTodosLosCambios(valor: boolean) {
    setItems((prev) =>
      prev.map((i) => (tieneCambioCosto(i) ? { ...i, actualizar_costo: valor } : i)),
    );
  }

  function quitarItem(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key));
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
            <strong>Sin conexión</strong> — la compra se guarda en este dispositivo y se sube sola
            cuando vuelva la señal.
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
          fd.set("items_json", JSON.stringify(items));
          formAction(fd);
        }}
        onSubmit={onSubmit}
        className="space-y-6"
        noValidate
      >
        {/* Cabecera de la compra */}
        <Card className="space-y-4 p-5">
          <h3 className="text-heading font-medium">Datos de la compra</h3>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Proveedor */}
            <div className="space-y-1.5">
              <Label htmlFor="proveedor_id">Proveedor (opcional)</Label>
              <div className="flex gap-2">
                <select
                  id="proveedor_id"
                  name="proveedor_id"
                  className={SELECT_CLASS}
                  value={proveedorId}
                  onChange={(e) => setProveedorId(e.target.value)}
                >
                  <option value="">Sin proveedor</option>
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={() => setProveedorModalOpen(true)}
                  aria-label="Nuevo proveedor"
                  title="Nuevo proveedor"
                >
                  <UserPlus className="size-4" />
                </Button>
              </div>
            </div>

            {/* Sucursal */}
            <div className="space-y-1.5">
              <Label htmlFor="sucursal_id">
                Sucursal <span className="text-danger">*</span>
              </Label>
              <select id="sucursal_id" name="sucursal_id" className={SELECT_CLASS} required>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Fecha */}
            <div className="space-y-1.5">
              <Label htmlFor="fecha">
                Fecha <span className="text-danger">*</span>
              </Label>
              <Input id="fecha" name="fecha" type="date" defaultValue={hoy()} required />
            </div>

            {/* Estado inicial */}
            <div className="space-y-1.5">
              <Label htmlFor="estado">Estado inicial</Label>
              <select id="estado" name="estado" className={SELECT_CLASS}>
                <option value="borrador">Borrador (pendiente de recibir)</option>
                <option value="recibida">Recibida directamente</option>
              </select>
              <p className="text-muted-foreground text-xs">
                &ldquo;Recibida&rdquo; suma el stock al inventario inmediatamente.
              </p>
            </div>

            {/* Método de pago */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="metodo_pago">
                ¿Cómo se pagó esta compra? <span className="text-danger">*</span>
              </Label>
              <select
                id="metodo_pago"
                name="metodo_pago"
                className={SELECT_CLASS}
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value as MmMetodoPago)}
                required
              >
                {metodosActivos.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>

              {metodoPago === "credito_proveedor" ? (
                <p className="flex items-center gap-1.5 text-xs text-amber-700">
                  <Info className="size-3.5 shrink-0" aria-hidden />
                  Esta compra quedará como cuenta por pagar: no se descuenta nada de caja/bancos
                  ahora. Podrás registrar el pago después desde el detalle de la compra.
                </p>
              ) : esEfectivo(metodoPago) ? (
                cajaAbierta ? (
                  <p className="text-muted-foreground text-xs">
                    Se descontará automáticamente de la caja abierta.
                  </p>
                ) : (
                  <p className="flex items-center gap-1.5 text-xs text-amber-700">
                    <Info className="size-3.5 shrink-0" aria-hidden />
                    Necesitas abrir la caja antes de guardar esta compra en efectivo.
                  </p>
                )
              ) : (
                <>
                  <input type="hidden" name="cuenta_bancaria_id" value={cuentaResueltaId} />
                  {cuentasDelMetodo.length > 1 ? (
                    <div className="space-y-1.5 pt-1">
                      <Label htmlFor="cuenta_bancaria_select">
                        Cuenta de la que sale el dinero
                      </Label>
                      <select
                        id="cuenta_bancaria_select"
                        value={cuentaResueltaId}
                        onChange={(e) => setCuentaBancariaId(e.target.value)}
                        className={SELECT_CLASS}
                      >
                        {cuentasDelMetodo.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.banco} — {c.titular}
                            {c.predeterminada ? " (predeterminada)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {faltaCuentaDigital ? (
                    <p className="flex items-center gap-1.5 text-xs text-amber-700">
                      <Info className="size-3.5 shrink-0" aria-hidden />
                      No hay una cuenta configurada para este método — configúrala en Bancos antes
                      de registrar esta compra.
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-xs">
                      Se descontará de: {cuentaResuelta?.banco} — {cuentaResuelta?.titular}.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Notas */}
          <div className="space-y-1.5">
            <Label htmlFor="notas">Notas (opcional)</Label>
            <textarea
              id="notas"
              name="notas"
              rows={2}
              placeholder="Condiciones, referencias, observaciones..."
              className="border-border bg-background focus-visible:ring-ring w-full resize-none rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
            />
          </div>
        </Card>

        {/* Buscador de productos */}
        <Card className="space-y-4 p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-heading font-medium">Productos</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setProductoModalOpen(true)}
            >
              <Plus className="size-4" />
              Nuevo producto
            </Button>
          </div>

          <div className="relative">
            <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              placeholder="Buscar producto por nombre o código..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Resultados de búsqueda */}
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
                    costo {usd(p.costo_usd)}
                  </span>
                </button>
              ))}
            </div>
          ) : busqueda.trim() ? (
            <p className="text-muted-foreground text-sm">No se encontraron productos.</p>
          ) : null}

          {/* Lista de ítems */}
          {items.length > 0 ? (
            <div className="space-y-2">
              {itemsConCambio.length >= 2 ? (
                <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    {itemsConCambio.length} productos cambiaron de costo respecto a tu inventario.
                    Revisa cada uno abajo.
                  </span>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => marcarTodosLosCambios(false)}
                    >
                      Mantener todos
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => marcarTodosLosCambios(true)}
                    >
                      Actualizar todos
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="text-muted-foreground hidden grid-cols-[1fr_90px_120px_32px] gap-2 px-1 text-xs uppercase tracking-wide sm:grid">
                <span>Producto</span>
                <span className="text-right">Cantidad</span>
                <span className="text-right">Costo USD</span>
                <span />
              </div>
              {items.map((item) => {
                const cambioCosto = tieneCambioCosto(item);
                return (
                  <div key={item.key} className="space-y-1.5">
                    <div className="bg-surface-2 grid grid-cols-2 items-start gap-2 rounded-lg px-3 py-2 sm:grid-cols-[1fr_90px_120px_32px] sm:items-center">
                      <div className="col-span-2 flex items-start justify-between gap-2 sm:col-span-1 sm:block">
                        <div className="min-w-0">
                          <p className="text-heading truncate text-sm font-medium">{item.nombre}</p>
                          <p className="text-muted-foreground text-xs tabular-nums">
                            Subtotal: {usd(item.cantidad * item.costo_unitario_usd)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => quitarItem(item.key)}
                          className="text-muted-foreground hover:text-danger flex size-8 shrink-0 items-center justify-center rounded transition-colors sm:hidden"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      <div className="space-y-1">
                        <p className="text-muted-foreground text-[11px] uppercase tracking-wide sm:hidden">
                          Cantidad
                        </p>
                        <Input
                          type="number"
                          step="0.001"
                          min="0.001"
                          value={item.cantidad}
                          onChange={(e) =>
                            actualizarItem(item.key, "cantidad", parseFloat(e.target.value) || 0)
                          }
                          className="h-8 text-right text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-muted-foreground text-[11px] uppercase tracking-wide sm:hidden">
                          Costo USD
                        </p>
                        <CampoMontoDual
                          id={`costo-${item.key}`}
                          name={`costo_unitario_usd_${item.key}`}
                          valorUsd={item.costo_unitario_usd.toFixed(2)}
                          onChangeUsd={(v) =>
                            actualizarItem(item.key, "costo_unitario_usd", Number(v) || 0)
                          }
                          tasa={tasa}
                          compact
                          className="h-8 text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => quitarItem(item.key)}
                        className="text-muted-foreground hover:text-danger hidden size-8 items-center justify-center rounded transition-colors sm:flex"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>

                    {cambioCosto ? (
                      <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 sm:flex-row sm:items-center sm:justify-between">
                        <span>
                          El costo cambió: {usd(item.costo_inventario_actual)} →{" "}
                          {usd(item.costo_unitario_usd)}
                        </span>
                        <div
                          role="group"
                          aria-label="¿Actualizar el costo en inventario?"
                          className="border-border bg-surface inline-flex shrink-0 rounded-md border p-0.5 text-[11px] font-medium"
                        >
                          <button
                            type="button"
                            onClick={() => setActualizarCosto(item.key, false)}
                            aria-pressed={!item.actualizar_costo}
                            className={cn(
                              "rounded px-2 py-1 transition-colors",
                              !item.actualizar_costo
                                ? "bg-accent-500 text-white"
                                : "text-muted-foreground hover:text-heading",
                            )}
                          >
                            Mantener
                          </button>
                          <button
                            type="button"
                            onClick={() => setActualizarCosto(item.key, true)}
                            aria-pressed={item.actualizar_costo}
                            className={cn(
                              "rounded px-2 py-1 transition-colors",
                              item.actualizar_costo
                                ? "bg-accent-500 text-white"
                                : "text-muted-foreground hover:text-heading",
                            )}
                          >
                            Actualizar costo e inventario
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {/* Totales */}
              <div className="border-border mt-3 space-y-1.5 border-t pt-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {items.length} producto{items.length !== 1 ? "s" : ""}
                  </span>
                  <div className="text-right">
                    <p className="text-heading font-semibold tabular-nums">{usd(totalUsd)}</p>
                    <p className="text-muted-foreground text-xs tabular-nums">{bs(totalBs)}</p>
                  </div>
                </div>
                {ivaActivo ? (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      IVA ({ivaPct} %) — control interno
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {usd(ivaEstimadoUsd)}
                    </span>
                  </div>
                ) : null}
                {igtfEstimadoUsd > 0 ? (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">IGTF (3 %) — pago en divisa</span>
                    <span className="text-muted-foreground tabular-nums">
                      {usd(igtfEstimadoUsd)}
                    </span>
                  </div>
                ) : null}
                {ivaActivo || igtfEstimadoUsd > 0 ? (
                  <div className="border-border flex items-center justify-between border-t pt-1.5 text-sm">
                    <span className="text-heading font-medium">Total pagado (estimado)</span>
                    <span className="text-heading font-semibold tabular-nums">
                      {usd(totalPagadoUsd)}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="border-border rounded-lg border border-dashed py-8 text-center">
              <Plus className="text-muted-foreground mx-auto mb-2 size-8" />
              <p className="text-muted-foreground text-sm">
                Busca y agrega los productos de esta compra.
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
          <SubmitButton
            disabled={items.length === 0 || guardandoLocal || (!offline && faltaCuentaDigital)}
            className="w-full sm:w-auto"
          >
            {guardandoLocal ? "Guardando…" : "Registrar compra"}
          </SubmitButton>
        </div>
      </form>

      {/* "+ Nuevo producto": reutiliza tal cual el modal de alta de Inventario
          (categorías, margen, impuesto, etc.) — al crearlo, queda en el
          inventario Y se agrega de inmediato a esta compra. */}
      <Dialog open={productoModalOpen} onOpenChange={setProductoModalOpen}>
        <DialogContent className="max-w-2xl">
          <ProductoForm
            categorias={categorias}
            sucursales={sucursales}
            proveedores={proveedores}
            impuestos={impuestos}
            impuestoIdDefault={impuestoIdDefault}
            aplicaIgtfDefault={aplicaIgtfDefault}
            etiquetasSugeridas={[]}
            tasa={tasa}
            margenGlobalActivo={margenGlobalActivo}
            margenGlobalPct={margenGlobalPct}
            skuSugerido={skuSugerido}
            tenantId={tenantId}
            usuarioId={usuarioId}
            onDone={onProductoCreado}
          />
        </DialogContent>
      </Dialog>

      {/* "+ Nuevo proveedor": reutiliza tal cual el formulario de alta de
          Proveedores — al crearlo, queda seleccionado en esta compra. */}
      <Dialog open={proveedorModalOpen} onOpenChange={setProveedorModalOpen}>
        <DialogContent className="max-w-xl p-0">
          <ProveedorForm action={crearProveedor} tenantId={tenantId} onDone={onProveedorCreado} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
