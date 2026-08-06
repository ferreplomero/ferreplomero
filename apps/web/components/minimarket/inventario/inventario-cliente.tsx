"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Download,
  Eye,
  FolderPlus,
  History,
  ImageIcon,
  Package,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  toast,
} from "@arkiteq/ui";
import {
  actualizarPrecioRapido,
  eliminarProducto,
} from "@/app/(vertical)/minimarket/inventario/actions";
import type { ProductoConStock } from "@/lib/minimarket/data/inventario";
import { margenSobreCosto, type OpcionImpuesto } from "@/lib/minimarket/producto-opciones";
import { ProductoForm } from "./producto-form-cargador";
import { CategoriaForm } from "./categoria-form-cargador";
import { MovimientoForm } from "./movimiento-form-cargador";
import { EliminarProductosLoteModal } from "./eliminar-productos-lote-modal";

interface InventarioClienteProps {
  productos: ProductoConStock[];
  categorias: { id: string; nombre: string }[];
  sucursales: { id: string; nombre: string }[];
  proveedores: { id: string; nombre: string }[];
  impuestos: OpcionImpuesto[];
  /** Defaults fiscales para un producto NUEVO, heredados de Configuración. */
  impuestoIdDefault: string;
  aplicaIgtfDefault: boolean;
  tasa: number | null;
  margenGlobalActivo: boolean;
  margenGlobalPct: number | null;
  skuSugerido: number;
  locale: string;
  tenantId: string;
  usuarioId: string;
}

const SELECT_CLASS =
  "border-border bg-background focus-visible:ring-ring h-10 rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2";

type Orden = "nombre" | "precio_desc" | "precio_asc" | "stock_asc" | "margen_desc";
type Estado = "todos" | "activos" | "inactivos";

export function InventarioCliente({
  productos,
  categorias,
  sucursales,
  proveedores,
  impuestos,
  impuestoIdDefault,
  aplicaIgtfDefault,
  tasa,
  margenGlobalActivo,
  margenGlobalPct,
  skuSugerido,
  locale,
  tenantId,
  usuarioId,
}: InventarioClienteProps) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [catFiltro, setCatFiltro] = React.useState("");
  const [tagFiltro, setTagFiltro] = React.useState("");
  const [estado, setEstado] = React.useState<Estado>("todos");
  const [orden, setOrden] = React.useState<Orden>("nombre");

  const [formOpen, setFormOpen] = React.useState(false);
  const [editando, setEditando] = React.useState<ProductoConStock | null>(null);
  const [catOpen, setCatOpen] = React.useState(false);
  const [eliminando, setEliminando] = React.useState<ProductoConStock | null>(null);
  const [moviendo, setMoviendo] = React.useState<ProductoConStock | null>(null);
  const [pendingDelete, startDelete] = React.useTransition();

  // Selección múltiple para borrado en lote — no interfiere con `eliminando`
  // (borrado individual), que sigue intacto.
  const [seleccionados, setSeleccionados] = React.useState<Set<string>>(new Set());
  const [loteModalOpen, setLoteModalOpen] = React.useState(false);
  const headerCheckboxRef = React.useRef<HTMLInputElement>(null);
  const mobileCheckboxRef = React.useRef<HTMLInputElement>(null);

  const money = React.useCallback(
    (valor: number, moneda: string) => {
      try {
        return new Intl.NumberFormat(locale, { style: "currency", currency: moneda }).format(valor);
      } catch {
        return `${moneda} ${valor.toFixed(2)}`;
      }
    },
    [locale],
  );

  const etiquetasSugeridas = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of productos) for (const t of p.etiquetas ?? []) set.add(t);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [productos]);

  const filtrados = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const lista = productos.filter((p) => {
      if (catFiltro && p.categoria_id !== catFiltro) return false;
      if (tagFiltro && !(p.etiquetas ?? []).includes(tagFiltro)) return false;
      if (estado === "activos" && !p.activo) return false;
      if (estado === "inactivos" && p.activo) return false;
      if (!q) return true;
      return (
        p.nombre.toLowerCase().includes(q) ||
        (p.codigo ?? "").toLowerCase().includes(q) ||
        (p.codigo_barras ?? "").toLowerCase().includes(q) ||
        (p.categoria_nombre ?? "").toLowerCase().includes(q) ||
        (p.etiquetas ?? []).some((t) => t.toLowerCase().includes(q))
      );
    });

    const ordenada = [...lista];
    ordenada.sort((a, b) => {
      switch (orden) {
        case "precio_desc":
          return Number(b.precio_usd) - Number(a.precio_usd);
        case "precio_asc":
          return Number(a.precio_usd) - Number(b.precio_usd);
        case "stock_asc":
          return a.stock_actual - b.stock_actual;
        case "margen_desc":
          return (
            (margenSobreCosto(Number(b.costo_usd), Number(b.precio_usd)) ?? -Infinity) -
            (margenSobreCosto(Number(a.costo_usd), Number(a.precio_usd)) ?? -Infinity)
          );
        default:
          return a.nombre.localeCompare(b.nombre);
      }
    });
    return ordenada;
  }, [productos, query, catFiltro, tagFiltro, estado, orden]);

  // Si un producto seleccionado deja de existir en la lista (p. ej. tras
  // refrescar después de otra eliminación), se quita de la selección.
  React.useEffect(() => {
    setSeleccionados((prev) => {
      let cambio = false;
      const next = new Set(prev);
      for (const id of prev) {
        if (!productos.some((p) => p.id === id)) {
          next.delete(id);
          cambio = true;
        }
      }
      return cambio ? next : prev;
    });
  }, [productos]);

  const todosVisiblesSeleccionados =
    filtrados.length > 0 && filtrados.every((p) => seleccionados.has(p.id));
  const algunosVisiblesSeleccionados = filtrados.some((p) => seleccionados.has(p.id));

  React.useEffect(() => {
    const indeterminado = algunosVisiblesSeleccionados && !todosVisiblesSeleccionados;
    if (headerCheckboxRef.current) headerCheckboxRef.current.indeterminate = indeterminado;
    if (mobileCheckboxRef.current) mobileCheckboxRef.current.indeterminate = indeterminado;
  }, [algunosVisiblesSeleccionados, todosVisiblesSeleccionados]);

  function alternarSeleccion(id: string) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function alternarTodosVisibles() {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (todosVisiblesSeleccionados) {
        for (const p of filtrados) next.delete(p.id);
      } else {
        for (const p of filtrados) next.add(p.id);
      }
      return next;
    });
  }

  const productosSeleccionados = productos.filter((p) => seleccionados.has(p.id));

  function loteTerminado({ eliminados, fallidos }: { eliminados: number; fallidos: number }) {
    setLoteModalOpen(false);
    setSeleccionados(new Set());
    router.refresh();
    if (fallidos === 0) {
      toast.success(
        `${eliminados} producto${eliminados === 1 ? "" : "s"} eliminado${eliminados === 1 ? "" : "s"}.`,
      );
    } else if (eliminados === 0) {
      toast.error(
        `No se pudo eliminar ${fallidos} producto${fallidos === 1 ? "" : "s"}. Revisa la lista para ver el motivo.`,
      );
    } else {
      toast.success(
        `${eliminados} producto${eliminados === 1 ? "" : "s"} eliminado${eliminados === 1 ? "" : "s"}, ${fallidos} no se pudo${fallidos === 1 ? "" : "ieron"} eliminar.`,
      );
    }
  }

  function abrirNuevo() {
    setEditando(null);
    setFormOpen(true);
  }
  function abrirEditar(p: ProductoConStock) {
    setEditando(p);
    setFormOpen(true);
  }
  function confirmarEliminar() {
    if (!eliminando) return;
    const fd = new FormData();
    fd.set("id", eliminando.id);
    startDelete(async () => {
      await eliminarProducto(fd);
      setEliminando(null);
      router.refresh();
    });
  }

  const hayFiltros = Boolean(query || catFiltro || tagFiltro || estado !== "todos");

  return (
    <div className="space-y-4">
      {/* Barra de herramientas */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, código, barras o etiqueta"
            className="pl-9"
            aria-label="Buscar productos"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="ghost">
            <Link href="/minimarket/inventario/movimientos">
              <History className="size-4" />
              Movimientos
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/minimarket/inventario/carga">
              <Upload className="size-4" />
              Carga masiva
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/minimarket/inventario/exportar" prefetch={false}>
              <Download className="size-4" />
              Exportar
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setCatOpen(true)}>
            <FolderPlus className="size-4" />
            Categoría
          </Button>
          <Button onClick={abrirNuevo}>
            <Plus className="size-4" />
            Nuevo producto
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <select
          className={SELECT_CLASS}
          value={catFiltro}
          onChange={(e) => setCatFiltro(e.target.value)}
          aria-label="Filtrar por categoría"
        >
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        {etiquetasSugeridas.length > 0 ? (
          <select
            className={SELECT_CLASS}
            value={tagFiltro}
            onChange={(e) => setTagFiltro(e.target.value)}
            aria-label="Filtrar por etiqueta"
          >
            <option value="">Todas las etiquetas</option>
            {etiquetasSugeridas.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        ) : null}
        <select
          className={SELECT_CLASS}
          value={estado}
          onChange={(e) => setEstado(e.target.value as Estado)}
          aria-label="Filtrar por estado"
        >
          <option value="todos">Todos los estados</option>
          <option value="activos">Solo activos</option>
          <option value="inactivos">Solo inactivos</option>
        </select>
        <select
          className={SELECT_CLASS}
          value={orden}
          onChange={(e) => setOrden(e.target.value as Orden)}
          aria-label="Ordenar"
        >
          <option value="nombre">Nombre (A-Z)</option>
          <option value="precio_desc">Precio (mayor)</option>
          <option value="precio_asc">Precio (menor)</option>
          <option value="stock_asc">Stock (menor)</option>
          <option value="margen_desc">Margen (mayor)</option>
        </select>
        {hayFiltros ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery("");
              setCatFiltro("");
              setTagFiltro("");
              setEstado("todos");
            }}
          >
            <X className="size-4" />
            Limpiar
          </Button>
        ) : null}
      </div>

      {/* Barra de acciones de selección múltiple */}
      {seleccionados.size > 0 ? (
        <div className="border-danger/30 bg-danger/5 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-2.5">
          <p className="text-heading text-sm font-medium">
            {seleccionados.size} producto{seleccionados.size === 1 ? "" : "s"} seleccionado
            {seleccionados.size === 1 ? "" : "s"}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSeleccionados(new Set())}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              size="sm"
              className="gap-1.5"
              onClick={() => setLoteModalOpen(true)}
            >
              <Trash2 className="size-4" aria-hidden />
              Eliminar seleccionados
            </Button>
          </div>
        </div>
      ) : null}

      {/* Tabla / estado vacío */}
      {filtrados.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <span className="bg-accent-500/12 text-accent-600 inline-flex size-12 items-center justify-center rounded-2xl">
            <Package className="size-6" aria-hidden />
          </span>
          <p className="text-heading font-medium">
            {productos.length === 0 ? "Aún no tienes productos" : "Sin resultados"}
          </p>
          <p className="text-muted-foreground max-w-sm text-sm">
            {productos.length === 0
              ? "Crea tu primer producto para empezar a controlar el inventario."
              : "Ajusta la búsqueda o los filtros para ver otros productos."}
          </p>
          {productos.length === 0 ? (
            <Button onClick={abrirNuevo} className="mt-2">
              <Plus className="size-4" />
              Nuevo producto
            </Button>
          ) : null}
        </Card>
      ) : (
        <>
          {/* Tarjetas — móvil/tablet (evita la tabla ancha, que en pantallas
              angostas arrastraba scroll horizontal a toda la página). */}
          <div className="space-y-3 lg:hidden">
            <label className="text-muted-foreground flex items-center gap-2 px-1 text-sm">
              <input
                ref={mobileCheckboxRef}
                type="checkbox"
                aria-label="Seleccionar todos los productos visibles"
                checked={todosVisiblesSeleccionados}
                onChange={alternarTodosVisibles}
                className="accent-danger size-5 rounded"
              />
              Seleccionar todo
            </label>
            {filtrados.map((p) => {
              const margen = margenSobreCosto(Number(p.costo_usd), Number(p.precio_usd));
              const gananciaUsd = Number(p.precio_usd) - Number(p.costo_usd);
              return (
                <Card key={p.id} className="space-y-3 p-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ${p.nombre}`}
                      checked={seleccionados.has(p.id)}
                      onChange={() => alternarSeleccion(p.id)}
                      className="accent-danger mt-1.5 size-5 shrink-0 rounded"
                    />
                    <div className="bg-surface-2 border-border relative size-12 shrink-0 overflow-hidden rounded-md border">
                      {p.imagen_url ? (
                        <Image
                          src={p.imagen_url}
                          alt={p.nombre}
                          width={48}
                          height={48}
                          className="size-12 object-cover"
                        />
                      ) : (
                        <div className="text-muted-foreground/60 flex size-full items-center justify-center">
                          <ImageIcon className="size-5" aria-hidden />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-heading truncate font-medium">{p.nombre}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {p.categoria_nombre ?? "Sin categoría"}
                        {p.codigo ? ` · ${p.codigo}` : ""}
                      </p>
                      {(p.etiquetas ?? []).length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(p.etiquetas ?? []).slice(0, 3).map((t) => (
                            <span
                              key={t}
                              className="bg-accent-500/10 text-accent-600 rounded-full px-1.5 py-0.5 text-xs"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {!p.activo ? (
                      <span className="bg-muted text-muted-foreground inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium">
                        Inactivo
                      </span>
                    ) : p.bajo_minimo ? (
                      <span className="bg-warning/15 text-warning inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                        <AlertTriangle className="size-3" aria-hidden />
                        Bajo mínimo
                      </span>
                    ) : (
                      <span className="bg-success/12 text-success inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium">
                        En stock
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Compra</p>
                      <p className="tabular-nums">
                        {Number(p.costo_usd) > 0 ? money(Number(p.costo_usd), "USD") : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Venta</p>
                      <PrecioEditable
                        producto={p}
                        money={money}
                        tasa={tasa}
                        onSaved={() => router.refresh()}
                      />
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Ganancia / margen</p>
                      {margen === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <p
                          className={`tabular-nums ${margen >= 0 ? "text-success" : "text-danger"}`}
                        >
                          {money(gananciaUsd, "USD")} · {margen.toFixed(0)}%
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Stock</p>
                      <p className="tabular-nums">
                        {p.stock_actual} <span className="text-muted-foreground">{p.unidad}</span>
                      </p>
                    </div>
                  </div>

                  <div className="border-border flex justify-end gap-1 border-t pt-2">
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      aria-label={`Ver detalle de ${p.nombre}`}
                    >
                      <Link href={`/minimarket/inventario/${p.id}`}>
                        <Eye className="size-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Registrar movimiento de ${p.nombre}`}
                      onClick={() => setMoviendo(p)}
                    >
                      <PackagePlus className="text-accent-600 size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Editar ${p.nombre}`}
                      onClick={() => abrirEditar(p)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Eliminar ${p.nombre}`}
                      onClick={() => setEliminando(p)}
                    >
                      <Trash2 className="text-danger size-4" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Tabla — escritorio */}
          <Card className="hidden overflow-hidden p-0 lg:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                  <tr>
                    <th className="w-10 px-4 py-3">
                      <input
                        ref={headerCheckboxRef}
                        type="checkbox"
                        aria-label="Seleccionar todos los productos visibles"
                        checked={todosVisiblesSeleccionados}
                        onChange={alternarTodosVisibles}
                        className="accent-danger size-4 rounded"
                      />
                    </th>
                    <th className="px-4 py-3 font-medium">Producto</th>
                    <th className="px-4 py-3 font-medium">Categoría</th>
                    <th className="px-4 py-3 text-right font-medium">Compra</th>
                    <th className="px-4 py-3 text-right font-medium">Venta</th>
                    <th className="px-4 py-3 text-right font-medium">Ganancia</th>
                    <th className="px-4 py-3 text-right font-medium">Margen</th>
                    <th className="px-4 py-3 text-right font-medium">Stock</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 text-right font-medium">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((p) => {
                    const margen = margenSobreCosto(Number(p.costo_usd), Number(p.precio_usd));
                    const gananciaUsd = Number(p.precio_usd) - Number(p.costo_usd);
                    return (
                      <tr key={p.id} className="border-border/70 border-b last:border-0">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            aria-label={`Seleccionar ${p.nombre}`}
                            checked={seleccionados.has(p.id)}
                            onChange={() => alternarSeleccion(p.id)}
                            className="accent-danger size-4 rounded"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="bg-surface-2 border-border relative size-12 shrink-0 overflow-hidden rounded-md border">
                              {p.imagen_url ? (
                                <Image
                                  src={p.imagen_url}
                                  alt={p.nombre}
                                  width={48}
                                  height={48}
                                  className="size-12 object-cover"
                                />
                              ) : (
                                <div className="text-muted-foreground/60 flex size-full items-center justify-center">
                                  <ImageIcon className="size-5" aria-hidden />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="text-heading font-medium">{p.nombre}</div>
                              <div className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
                                {p.codigo ? <span>{p.codigo}</span> : null}
                                {(p.etiquetas ?? []).slice(0, 3).map((t) => (
                                  <span
                                    key={t}
                                    className="bg-accent-500/10 text-accent-600 rounded-full px-1.5 py-0.5"
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="text-muted-foreground px-4 py-3">
                          {p.categoria_nombre ?? "—"}
                        </td>
                        <td className="text-muted-foreground px-4 py-3 text-right tabular-nums">
                          {Number(p.costo_usd) > 0 ? money(Number(p.costo_usd), "USD") : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <PrecioEditable
                            producto={p}
                            money={money}
                            tasa={tasa}
                            onSaved={() => router.refresh()}
                          />
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {margen === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <div className={margen >= 0 ? "text-success" : "text-danger"}>
                              <div>{money(gananciaUsd, "USD")}</div>
                              {tasa ? (
                                <div className="text-xs opacity-80">
                                  {money(gananciaUsd * tasa, "VES")}
                                </div>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {margen === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className={margen >= 0 ? "text-success" : "text-danger"}>
                              {margen.toFixed(0)}%
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {p.stock_actual}
                          <span className="text-muted-foreground"> {p.unidad}</span>
                        </td>
                        <td className="px-4 py-3">
                          {!p.activo ? (
                            <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
                              Inactivo
                            </span>
                          ) : p.bajo_minimo ? (
                            <span className="bg-warning/15 text-warning inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                              <AlertTriangle className="size-3" aria-hidden />
                              Bajo mínimo
                            </span>
                          ) : (
                            <span className="bg-success/12 text-success inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
                              En stock
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <Button
                              asChild
                              variant="ghost"
                              size="icon"
                              aria-label={`Ver detalle de ${p.nombre}`}
                            >
                              <Link href={`/minimarket/inventario/${p.id}`}>
                                <Eye className="size-4" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Registrar movimiento de ${p.nombre}`}
                              onClick={() => setMoviendo(p)}
                            >
                              <PackagePlus className="text-accent-600 size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Editar ${p.nombre}`}
                              onClick={() => abrirEditar(p)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Eliminar ${p.nombre}`}
                              onClick={() => setEliminando(p)}
                            >
                              <Trash2 className="text-danger size-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* Diálogo crear/editar producto */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl">
          <ProductoForm
            key={editando?.id ?? "nuevo"}
            producto={editando}
            categorias={categorias}
            sucursales={sucursales}
            proveedores={proveedores}
            impuestos={impuestos}
            impuestoIdDefault={impuestoIdDefault}
            aplicaIgtfDefault={aplicaIgtfDefault}
            etiquetasSugeridas={etiquetasSugeridas}
            tasa={tasa}
            margenGlobalActivo={margenGlobalActivo}
            margenGlobalPct={margenGlobalPct}
            skuSugerido={skuSugerido}
            tenantId={tenantId}
            usuarioId={usuarioId}
            onDone={() => setFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Diálogo registrar movimiento */}
      <Dialog open={Boolean(moviendo)} onOpenChange={(o) => !o && setMoviendo(null)}>
        <DialogContent>
          {moviendo ? (
            <MovimientoForm
              key={moviendo.id}
              producto={{ id: moviendo.id, nombre: moviendo.nombre }}
              sucursales={sucursales}
              tenantId={tenantId}
              usuarioId={usuarioId}
              onDone={() => setMoviendo(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Diálogo nueva categoría */}
      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent className="max-w-md">
          <CategoriaForm tenantId={tenantId} onDone={() => setCatOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Confirmación de borrado */}
      <Dialog open={Boolean(eliminando)} onOpenChange={(o) => !o && setEliminando(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar producto</DialogTitle>
            <DialogDescription>
              ¿Seguro que quieres eliminar “{eliminando?.nombre}”? Podrás volver a crearlo, pero
              dejará de aparecer en el inventario.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEliminando(null)} disabled={pendingDelete}>
              Cancelar
            </Button>
            <Button
              onClick={confirmarEliminar}
              disabled={pendingDelete}
              className="bg-danger hover:bg-danger/90 text-white"
            >
              {pendingDelete ? "Eliminando…" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EliminarProductosLoteModal
        open={loteModalOpen}
        onOpenChange={setLoteModalOpen}
        productos={productosSeleccionados}
        onTerminado={loteTerminado}
      />
    </div>
  );
}

/** Celda de precio de venta con edición rápida en línea. */
function PrecioEditable({
  producto,
  money,
  tasa,
  onSaved,
}: {
  producto: ProductoConStock;
  money: (valor: number, moneda: string) => string;
  tasa: number | null;
  onSaved: () => void;
}) {
  const [editando, setEditando] = React.useState(false);
  const [valor, setValor] = React.useState(String(producto.precio_usd));
  const [guardando, startGuardar] = React.useTransition();
  const [error, setError] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editando) inputRef.current?.select();
  }, [editando]);

  function guardar() {
    const fd = new FormData();
    fd.set("id", producto.id);
    fd.set("precio_usd", valor);
    startGuardar(async () => {
      const res = await actualizarPrecioRapido(fd);
      if (res?.error) {
        setError(true);
        return;
      }
      setError(false);
      setEditando(false);
      onSaved();
    });
  }

  if (editando) {
    return (
      <div className="flex items-center justify-end gap-1">
        <Input
          ref={inputRef}
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") guardar();
            if (e.key === "Escape") setEditando(false);
          }}
          aria-invalid={error}
          className="h-8 w-24 text-right"
        />
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onClick={guardar}
          disabled={guardando}
          aria-label="Guardar precio"
        >
          <Check className="text-success size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onClick={() => {
            setValor(String(producto.precio_usd));
            setEditando(false);
          }}
          aria-label="Cancelar"
        >
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditando(true)}
      className="hover:bg-surface-2 group ml-auto flex flex-col items-end rounded-md px-2 py-1"
      aria-label={`Editar precio de ${producto.nombre}`}
    >
      <span className="text-heading inline-flex items-center gap-1 tabular-nums">
        {money(Number(producto.precio_usd), "USD")}
        <Pencil className="text-muted-foreground/0 group-hover:text-muted-foreground size-3 transition" />
      </span>
      {tasa ? (
        <span className="text-muted-foreground text-xs tabular-nums">
          {money(Number(producto.precio_usd) * tasa, "VES")}
        </span>
      ) : null}
    </button>
  );
}
