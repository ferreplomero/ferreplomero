"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
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
  Tag,
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
import { margenMostrado, type OpcionImpuesto } from "@/lib/minimarket/producto-opciones";
import { ProductoForm } from "./producto-form-cargador";
import { CategoriaForm } from "./categoria-form-cargador";
import { MovimientoForm } from "./movimiento-form-cargador";
import { EliminarProductosLoteModal } from "./eliminar-productos-lote-modal";
import { PrecioRapidoModal } from "@/components/minimarket/shared/precio-rapido-modal";

interface InventarioClienteProps {
  productos: ProductoConStock[];
  categorias: { id: string; nombre: string }[];
  sucursales: { id: string; nombre: string }[];
  /** Sucursal activa del usuario — preselecciona el filtro (null/1 sucursal = sin preselección). */
  sucursalActivaId?: string | null;
  proveedores: { id: string; nombre: string }[];
  impuestos: OpcionImpuesto[];
  /** Defaults fiscales para un producto NUEVO, heredados de Configuración. */
  impuestoIdDefault: string;
  aplicaIgtfDefault: boolean;
  tasa: number | null;
  /** Tasas BCV y Euro vigentes — para el diferencial de tasa del proveedor
   * en el formulario de producto. */
  tasas: { bcv: number | null; euro: number | null };
  /** Config fiscal del negocio — igual que en el POS, para que el modal de
   * precio rápido calcule el IVA exactamente igual que una venta real. */
  ivaActivo: boolean;
  ivaPct: number;
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

/** Productos por página — la búsqueda/filtros siguen operando sobre TODO el
 * inventario cargado (ver `filtrados`); esto solo pagina el resultado ya
 * filtrado para no renderizar miles de filas de una vez. */
const PAGE_SIZE = 20;

export function InventarioCliente({
  productos,
  categorias,
  sucursales,
  sucursalActivaId,
  proveedores,
  impuestos,
  impuestoIdDefault,
  aplicaIgtfDefault,
  tasa,
  tasas,
  ivaActivo,
  ivaPct,
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
  const [sucursalFiltro, setSucursalFiltro] = React.useState(sucursalActivaId ?? "");
  const [estado, setEstado] = React.useState<Estado>("todos");
  const [orden, setOrden] = React.useState<Orden>("nombre");

  const [formOpen, setFormOpen] = React.useState(false);
  const [editando, setEditando] = React.useState<ProductoConStock | null>(null);
  const [catOpen, setCatOpen] = React.useState(false);
  const [eliminando, setEliminando] = React.useState<ProductoConStock | null>(null);
  const [moviendo, setMoviendo] = React.useState<ProductoConStock | null>(null);
  const [precioRapido, setPrecioRapido] = React.useState<ProductoConStock | null>(null);
  const [pendingDelete, startDelete] = React.useTransition();

  // Selección múltiple para borrado en lote — no interfiere con `eliminando`
  // (borrado individual), que sigue intacto.
  const [seleccionados, setSeleccionados] = React.useState<Set<string>>(new Set());
  const [loteModalOpen, setLoteModalOpen] = React.useState(false);
  const [pagina, setPagina] = React.useState(1);
  const headerCheckboxRef = React.useRef<HTMLInputElement>(null);
  const mobileCheckboxRef = React.useRef<HTMLInputElement>(null);

  // Scroll horizontal duplicado (arriba, fijo) para la tabla de escritorio —
  // el navegador solo dibuja la barra nativa pegada al borde inferior de la
  // tabla, que queda fuera de vista si hay muchas filas. Este par de divs
  // sincroniza scrollLeft entre sí; `syncingScrollRef` evita el loop infinito
  // que dispararía cada scroll el onScroll del otro.
  const scrollArribaRef = React.useRef<HTMLDivElement>(null);
  const scrollTablaRef = React.useRef<HTMLDivElement>(null);
  const tablaRef = React.useRef<HTMLTableElement>(null);
  const syncingScrollRef = React.useRef(false);
  const [anchoTabla, setAnchoTabla] = React.useState(0);

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

  /** Resuelve stock/mínimo/bajo-mínimo/disponibilidad de un producto según el
   * filtro de sucursal activo. Sin filtro (o una sola sucursal): exactamente
   * los totales agregados de siempre, sin cambio de comportamiento. */
  const resolverStock = React.useCallback(
    (p: ProductoConStock) => {
      if (!sucursalFiltro) {
        return {
          stock: p.stock_actual,
          minimo: p.stock_minimo,
          bajoMinimo: p.bajo_minimo,
          disponible: true,
        };
      }
      const fila = p.stockPorSucursal.find((s) => s.sucursal_id === sucursalFiltro);
      if (!fila || !fila.disponible) {
        return { stock: 0, minimo: null, bajoMinimo: false, disponible: false };
      }
      return {
        stock: fila.stock_actual,
        minimo: fila.stock_minimo > 0 ? fila.stock_minimo : null,
        bajoMinimo: fila.stock_minimo > 0 && fila.stock_actual <= fila.stock_minimo,
        disponible: true,
      };
    },
    [sucursalFiltro],
  );

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
          return resolverStock(a).stock - resolverStock(b).stock;
        case "margen_desc":
          return (margenMostrado(b) ?? -Infinity) - (margenMostrado(a) ?? -Infinity);
        default:
          return a.nombre.localeCompare(b.nombre);
      }
    });
    return ordenada;
  }, [productos, query, catFiltro, tagFiltro, estado, orden, resolverStock]);

  // Cambiar la búsqueda o cualquier filtro vuelve a la página 1 — evita
  // quedar en una página vacía tras acotar el resultado.
  React.useEffect(() => {
    setPagina(1);
  }, [query, catFiltro, tagFiltro, estado, sucursalFiltro, orden]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));

  // Si el resultado filtrado encoge (p. ej. tras eliminar productos) y la
  // página actual queda fuera de rango, se recorta a la última válida.
  React.useEffect(() => {
    setPagina((p) => Math.min(p, totalPaginas));
  }, [totalPaginas]);

  const paginaProductos = React.useMemo(
    () => filtrados.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE),
    [filtrados, pagina],
  );

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

  // "Visibles" = productos de la página actual (lo que realmente se ve en
  // pantalla), no todo el resultado filtrado — con paginación, seleccionar
  // "todo" no debe marcar en silencio productos de otras páginas.
  const todosVisiblesSeleccionados =
    paginaProductos.length > 0 && paginaProductos.every((p) => seleccionados.has(p.id));
  const algunosVisiblesSeleccionados = paginaProductos.some((p) => seleccionados.has(p.id));

  React.useEffect(() => {
    const indeterminado = algunosVisiblesSeleccionados && !todosVisiblesSeleccionados;
    if (headerCheckboxRef.current) headerCheckboxRef.current.indeterminate = indeterminado;
    if (mobileCheckboxRef.current) mobileCheckboxRef.current.indeterminate = indeterminado;
  }, [algunosVisiblesSeleccionados, todosVisiblesSeleccionados]);

  // Ancho real de la tabla (para la barra de scroll superior) — se recalcula
  // con ResizeObserver, no solo al cambiar de página: el ancho también cambia
  // si una columna crece por contenido nuevo (ej. nombres largos) sin que
  // cambie la cantidad de filas.
  React.useEffect(() => {
    const tabla = tablaRef.current;
    if (!tabla) return;
    const actualizar = () => setAnchoTabla(tabla.scrollWidth);
    actualizar();
    const observer = new ResizeObserver(actualizar);
    observer.observe(tabla);
    return () => observer.disconnect();
  }, [paginaProductos]);

  function onScrollArriba() {
    if (syncingScrollRef.current) {
      syncingScrollRef.current = false;
      return;
    }
    syncingScrollRef.current = true;
    if (scrollTablaRef.current && scrollArribaRef.current) {
      scrollTablaRef.current.scrollLeft = scrollArribaRef.current.scrollLeft;
    }
  }

  function onScrollTabla() {
    if (syncingScrollRef.current) {
      syncingScrollRef.current = false;
      return;
    }
    syncingScrollRef.current = true;
    if (scrollArribaRef.current && scrollTablaRef.current) {
      scrollArribaRef.current.scrollLeft = scrollTablaRef.current.scrollLeft;
    }
  }

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
        for (const p of paginaProductos) next.delete(p.id);
      } else {
        for (const p of paginaProductos) next.add(p.id);
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

  const hayFiltros = Boolean(
    query || catFiltro || tagFiltro || estado !== "todos" || sucursalFiltro,
  );

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
        {sucursales.length > 1 ? (
          <select
            className={SELECT_CLASS}
            value={sucursalFiltro}
            onChange={(e) => setSucursalFiltro(e.target.value)}
            aria-label="Filtrar por sucursal"
          >
            <option value="">Todas las sucursales</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        ) : null}
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
              setSucursalFiltro("");
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
            {paginaProductos.map((p) => {
              const margen = margenMostrado(p);
              const gananciaUsd = Number(p.precio_usd) - Number(p.costo_usd);
              const info = resolverStock(p);
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
                    <button
                      type="button"
                      onClick={() => setPrecioRapido(p)}
                      aria-label={`Ver precio y stock de ${p.nombre}`}
                      className="bg-surface-2 border-border relative size-12 shrink-0 cursor-pointer overflow-hidden rounded-md border"
                    >
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
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-heading truncate font-medium" title={p.nombre}>
                        {p.nombre}
                      </p>
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
                    {!info.disponible ? (
                      <span className="bg-muted text-muted-foreground inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium">
                        No disponible aquí
                      </span>
                    ) : !p.activo ? (
                      <span className="bg-muted text-muted-foreground inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium">
                        Inactivo
                      </span>
                    ) : info.bajoMinimo ? (
                      <span className="bg-warning/15 text-warning inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium">
                        <AlertTriangle className="size-3" aria-hidden />
                        Bajo mínimo
                      </span>
                    ) : (
                      <span className="bg-success/12 text-success inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium">
                        En stock
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <div className="min-w-0">
                      <p className="text-muted-foreground text-xs">Compra</p>
                      <p className="whitespace-nowrap tabular-nums">
                        {Number(p.costo_usd) > 0 ? money(Number(p.costo_usd), "USD") : "—"}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-muted-foreground text-xs">Venta</p>
                      <PrecioEditable
                        producto={p}
                        money={money}
                        tasa={tasa}
                        onSaved={() => router.refresh()}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-muted-foreground text-xs">Ganancia / margen</p>
                      {margen === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <p
                          className={`whitespace-nowrap tabular-nums ${margen >= 0 ? "text-success" : "text-danger"}`}
                        >
                          {money(gananciaUsd, "USD")}
                        </p>
                      )}
                      {margen !== null ? (
                        <p
                          className={`whitespace-nowrap text-xs tabular-nums opacity-80 ${margen >= 0 ? "text-success" : "text-danger"}`}
                        >
                          {margen.toFixed(0)}%
                        </p>
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <p className="text-muted-foreground text-xs">Stock</p>
                      {info.disponible ? (
                        <p className="whitespace-nowrap tabular-nums">
                          {info.stock} <span className="text-muted-foreground">{p.unidad}</span>
                        </p>
                      ) : (
                        <p className="text-muted-foreground">No disponible aquí</p>
                      )}
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
                      aria-label={`Precio rápido de ${p.nombre}`}
                      onClick={() => setPrecioRapido(p)}
                    >
                      <Tag className="size-4" />
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
          {/* Barra de scroll horizontal duplicada arriba, fija bajo el header
              (top-16 = altura del header sticky) — mismo scrollLeft que la
              barra nativa de abajo, para no tener que bajar hasta el fondo de
              una tabla larga solo para desplazarla de lado. */}
          <div
            ref={scrollArribaRef}
            onScroll={onScrollArriba}
            className="border-border bg-background sticky top-16 z-20 hidden overflow-x-auto overflow-y-hidden rounded-t-lg border-x border-t lg:block"
            style={{ height: 14 }}
          >
            <div style={{ width: anchoTabla, height: 1 }} />
          </div>
          <Card className="hidden overflow-hidden rounded-t-none border-t-0 p-0 lg:block">
            <div ref={scrollTablaRef} onScroll={onScrollTabla} className="overflow-x-auto">
              <table ref={tablaRef} className="w-full min-w-[900px] text-sm">
                <thead className="border-border text-muted-foreground whitespace-nowrap border-b text-left text-xs uppercase tracking-wide">
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
                  {paginaProductos.map((p) => {
                    const margen = margenMostrado(p);
                    const gananciaUsd = Number(p.precio_usd) - Number(p.costo_usd);
                    const info = resolverStock(p);
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
                            <button
                              type="button"
                              onClick={() => setPrecioRapido(p)}
                              aria-label={`Ver precio y stock de ${p.nombre}`}
                              className="bg-surface-2 border-border relative size-12 shrink-0 cursor-pointer overflow-hidden rounded-md border"
                            >
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
                            </button>
                            <div className="min-w-0 max-w-[240px] xl:max-w-xs">
                              <div className="text-heading truncate font-medium" title={p.nombre}>
                                {p.nombre}
                              </div>
                              <div className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
                                {p.codigo ? (
                                  <span className="whitespace-nowrap">{p.codigo}</span>
                                ) : null}
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
                          <span
                            className="block max-w-[140px] truncate"
                            title={p.categoria_nombre ?? undefined}
                          >
                            {p.categoria_nombre ?? "—"}
                          </span>
                        </td>
                        <td className="text-muted-foreground whitespace-nowrap px-4 py-3 text-right tabular-nums">
                          {Number(p.costo_usd) > 0 ? money(Number(p.costo_usd), "USD") : "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <PrecioEditable
                            producto={p}
                            money={money}
                            tasa={tasa}
                            onSaved={() => router.refresh()}
                          />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
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
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                          {margen === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className={margen >= 0 ? "text-success" : "text-danger"}>
                              {margen.toFixed(0)}%
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                          {info.disponible ? (
                            <>
                              {info.stock}
                              <span className="text-muted-foreground"> {p.unidad}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">No disponible aquí</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {!info.disponible ? (
                            <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
                              No disponible aquí
                            </span>
                          ) : !p.activo ? (
                            <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
                              Inactivo
                            </span>
                          ) : info.bajoMinimo ? (
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
                              aria-label={`Precio rápido de ${p.nombre}`}
                              onClick={() => setPrecioRapido(p)}
                            >
                              <Tag className="size-4" />
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

          {/* Paginación — la búsqueda/filtros de arriba ya operan sobre todo
              el inventario cargado; esto solo pagina el resultado. */}
          {totalPaginas > 1 ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-muted-foreground text-sm">
                Mostrando {(pagina - 1) * PAGE_SIZE + 1}–
                {Math.min(pagina * PAGE_SIZE, filtrados.length)} de {filtrados.length} productos
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  disabled={pagina <= 1}
                >
                  <ChevronLeft className="size-4" />
                  Anterior
                </Button>
                <span className="text-muted-foreground text-sm tabular-nums">
                  Página {pagina} de {totalPaginas}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                  disabled={pagina >= totalPaginas}
                >
                  Siguiente
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          ) : null}
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
            tasas={tasas}
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

      <PrecioRapidoModal
        producto={precioRapido}
        onClose={() => setPrecioRapido(null)}
        tasa={tasa}
        ivaActivo={ivaActivo}
        ivaPct={ivaPct}
        locale={locale}
        stock={
          precioRapido
            ? {
                disponible: resolverStock(precioRapido).disponible,
                cantidad: resolverStock(precioRapido).stock,
                unidad: precioRapido.unidad,
              }
            : undefined
        }
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
      <span className="text-heading inline-flex items-center gap-1 whitespace-nowrap tabular-nums">
        {money(Number(producto.precio_usd), "USD")}
        <Pencil className="text-muted-foreground/0 group-hover:text-muted-foreground size-3 transition" />
      </span>
      {tasa ? (
        <span className="text-muted-foreground whitespace-nowrap text-xs tabular-nums">
          {money(Number(producto.precio_usd) * tasa, "VES")}
        </span>
      ) : null}
    </button>
  );
}
