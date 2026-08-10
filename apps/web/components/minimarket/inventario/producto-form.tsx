"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Camera,
  ImageIcon,
  ImagePlus,
  PlusCircle,
  ScanLine,
  Sparkles,
  WifiOff,
  X,
} from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  toast,
} from "@arkiteq/ui";
import { PowerSyncContext } from "@powersync/react";
import { SubmitButton } from "@/components/auth/submit-button";
import {
  actualizarProducto,
  crearProducto,
  type ActionResult,
} from "@/app/(vertical)/minimarket/inventario/actions";
import type { ProductoConStock } from "@/lib/minimarket/data/inventario";
import {
  actualizarProductoLocal,
  crearProductoLocal,
} from "@/lib/minimarket/powersync/registrar-producto-local";
import { useOnline } from "@/lib/minimarket/use-online";
import { CampoMontoDual } from "@/components/minimarket/shared/campo-monto-dual";
import { TomarFotoDialog } from "@/components/minimarket/shared/tomar-foto-dialog";
import { CategoriaForm } from "@/components/minimarket/inventario/categoria-form-cargador";
import { comprimirImagen } from "@/lib/minimarket/comprimir-imagen";
import {
  TIPOS_VENTA,
  UNIDADES_PREDEFINIDAS,
  generarSku,
  margenSobreCosto,
  precioDesdeMargen,
  unidadesSugeridas,
  type OpcionImpuesto,
} from "@/lib/minimarket/producto-opciones";

export interface ProductoFormProps {
  producto?: ProductoConStock | null;
  categorias: { id: string; nombre: string }[];
  sucursales: { id: string; nombre: string }[];
  proveedores: { id: string; nombre: string }[];
  impuestos: OpcionImpuesto[];
  /**
   * Defaults fiscales heredados de Configuración (`defaultsFiscalesProducto`)
   * — solo se usan para un producto NUEVO; uno existente siempre conserva lo
   * que ya tiene guardado (nunca se pisa al editar).
   */
  impuestoIdDefault: string;
  aplicaIgtfDefault: boolean;
  etiquetasSugeridas: string[];
  tasa: number | null;
  /** Margen de ganancia global del negocio (Configuración) — valor por defecto sugerido. */
  margenGlobalActivo: boolean;
  margenGlobalPct: number | null;
  skuSugerido: number;
  tenantId: string;
  usuarioId: string;
  /**
   * Llamado al guardar con éxito. Al CREAR (no al editar), recibe el producto
   * recién creado — usado por quien reutiliza este formulario fuera de
   * Inventario (ej. el modal de "Nuevo producto" en Compras) para agregarlo
   * de inmediato sin recargar ni volver a buscarlo.
   */
  onDone: (creado?: {
    id: string;
    nombre: string;
    costoUsd: number;
    imagenUrl: string | null;
  }) => void;
}

const SELECT_CLASS =
  "border-border bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2";

const UNIDAD_OTRA = "__otra__";

const dosDecimales = (n: number) => (Math.round(n * 100) / 100).toString();

export function ProductoForm({
  producto,
  categorias,
  sucursales,
  proveedores,
  impuestos,
  impuestoIdDefault,
  aplicaIgtfDefault,
  etiquetasSugeridas,
  tasa,
  margenGlobalActivo,
  margenGlobalPct,
  skuSugerido,
  tenantId,
  usuarioId,
  onDone,
}: ProductoFormProps) {
  const router = useRouter();
  const powerSyncDb = React.useContext(PowerSyncContext);
  const offline = !useOnline();
  const editando = Boolean(producto);
  const action = editando ? actualizarProducto : crearProducto;
  const [state, formAction] = useActionState<ActionResult, FormData>(action, {});
  const [guardandoLocal, setGuardandoLocal] = React.useState(false);

  // ---- Imagen (subida o tomada con cámara, optimizada en el navegador) ----
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<string | null>(producto?.imagen_url ?? null);
  const [removed, setRemoved] = React.useState(false);
  const [comprimiendo, setComprimiendo] = React.useState(false);
  const [fotoDialogOpen, setFotoDialogOpen] = React.useState(false);

  /** Pone `file` (YA optimizado) como el archivo real del `<input type="file">`
   * — así el envío normal del formulario (online y offline) lo levanta solo,
   * sin tocar el resto de la lógica de guardado. */
  function reemplazarArchivoInput(file: File) {
    if (!fileRef.current) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    fileRef.current.files = dt.files;
  }

  /** Redimensiona/comprime la foto (venga de la galería o de la cámara) antes
   * de mostrarla y de que quede lista para subir — fotos de cámara sin
   * procesar pueden pesar varios MB. */
  async function procesarNuevaFoto(origen: Blob) {
    setComprimiendo(true);
    try {
      const optimizada = await comprimirImagen(origen);
      reemplazarArchivoInput(optimizada);
      setPreview(URL.createObjectURL(optimizada));
      setRemoved(false);
    } catch {
      toast.error("No se pudo optimizar esa imagen. Intenta con otra foto.");
    } finally {
      setComprimiendo(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void procesarNuevaFoto(f);
  }
  function onCapturarFoto(blob: Blob) {
    void procesarNuevaFoto(blob);
  }
  function quitarFoto() {
    setPreview(null);
    setRemoved(true);
    if (fileRef.current) fileRef.current.value = "";
  }

  // ---- Identificación ----
  const [nombre, setNombre] = React.useState(producto?.nombre ?? "");
  const [sku, setSku] = React.useState(producto?.codigo ?? "");

  // ---- Categoría (con alta rápida "+ Nueva categoría" sin salir del formulario) ----
  const [categoriasLista, setCategoriasLista] = React.useState(categorias);
  const [categoriaId, setCategoriaId] = React.useState(producto?.categoria_id ?? "");
  const [categoriaModalOpen, setCategoriaModalOpen] = React.useState(false);
  // Memoizado: `CategoriaForm` pasa esta función en la dependencia de un
  // useEffect — una referencia nueva en cada render (función inline) dispara
  // ese efecto sin fin (router.refresh() re-renderiza este componente, que
  // crea una nueva función, que vuelve a disparar el efecto...).
  const onCategoriaCreada = React.useCallback((creada?: { id: string; nombre: string }) => {
    setCategoriaModalOpen(false);
    if (!creada) return;
    setCategoriasLista((prev) =>
      [...prev, creada].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    );
    setCategoriaId(creada.id);
    toast.success(`Categoría "${creada.nombre}" creada y seleccionada.`);
  }, []);

  // ---- Códigos de barras (varios) ----
  const [codigos, setCodigos] = React.useState<string[]>(producto?.codigos ?? []);
  const [codigoInput, setCodigoInput] = React.useState("");
  function addCodigo(raw: string) {
    const c = raw.trim().slice(0, 64);
    if (c && !codigos.includes(c) && codigos.length < 10) setCodigos([...codigos, c]);
    setCodigoInput("");
  }

  // ---- Tipo de venta y unidad ----
  const [tipoVenta, setTipoVenta] = React.useState<"unidad" | "granel">(
    producto?.tipo_venta ?? "unidad",
  );
  const unidadesDisponibles = unidadesSugeridas(tipoVenta);
  const unidadInicialEsPredef = UNIDADES_PREDEFINIDAS.some(
    (u) => u.value === (producto?.unidad ?? "unidad"),
  );
  const [unidadSel, setUnidadSel] = React.useState(
    producto && !unidadInicialEsPredef ? UNIDAD_OTRA : (producto?.unidad ?? "unidad"),
  );
  const [unidadOtra, setUnidadOtra] = React.useState(
    producto && !unidadInicialEsPredef ? producto.unidad : "",
  );
  const unidadValor = unidadSel === UNIDAD_OTRA ? unidadOtra : unidadSel;

  function onTipoVenta(value: "unidad" | "granel") {
    setTipoVenta(value);
    // Granel se vende por peso/volumen: sugiere kg si la unidad era "unidad".
    if (value === "granel" && (unidadSel === "unidad" || unidadSel === "")) setUnidadSel("kg");
    if (value === "unidad" && unidadSel === "kg") setUnidadSel("unidad");
  }

  // ---- Precios y margen (bidireccional, con margen de ganancia global) ----
  // Si hay margen global activo, un producto NUEVO nace "siguiendolo": el
  // costo que se escriba calcula el precio con ESE %, y el % se muestra fijo
  // en el global. En cuanto el usuario toca el precio o el margen a mano
  // (`onPrecio`/`onMargen`), este producto pasa a tener margen PERSONALIZADO
  // y deja de seguir cambios futuros del global — hasta que el usuario pida
  // volver a seguirlo (`volverAMargenGlobal`). Editar el costo NO rompe el
  // seguimiento del global (sigue recalculando el precio proporcionalmente),
  // es precisamente lo que "seguir el global" significa.
  const hayMargenGlobal = margenGlobalActivo && margenGlobalPct != null;
  const [siguiendoGlobal, setSiguiendoGlobal] = React.useState(() =>
    producto ? Boolean(producto.usa_margen_global) : hayMargenGlobal,
  );

  const [costo, setCosto] = React.useState(producto ? String(producto.costo_usd) : "");
  const [precio, setPrecio] = React.useState(producto ? String(producto.precio_usd) : "");
  const [margen, setMargen] = React.useState(() => {
    if (!producto && hayMargenGlobal) return dosDecimales(margenGlobalPct as number);
    const m = margenSobreCosto(Number(producto?.costo_usd), Number(producto?.precio_usd));
    return m === null ? "" : dosDecimales(m);
  });

  const numero = (s: string) => Number(s.replace(",", "."));

  function onCosto(value: string) {
    setCosto(value);
    if (siguiendoGlobal && hayMargenGlobal) {
      const pct = margenGlobalPct as number;
      setMargen(dosDecimales(pct));
      const c = numero(value);
      if (c > 0) setPrecio(dosDecimales(precioDesdeMargen(c, pct)));
      return;
    }
    const m = margenSobreCosto(numero(value), numero(precio));
    if (m !== null) setMargen(dosDecimales(m));
  }
  function onPrecio(value: string) {
    setPrecio(value);
    setSiguiendoGlobal(false);
    const m = margenSobreCosto(numero(costo), numero(value));
    if (m !== null) setMargen(dosDecimales(m));
  }
  function onMargen(value: string) {
    setMargen(value);
    setSiguiendoGlobal(false);
    const c = numero(costo);
    const m = numero(value);
    if (c > 0 && Number.isFinite(m)) setPrecio(dosDecimales(precioDesdeMargen(c, m)));
  }
  /** Descarta el margen personalizado y vuelve a seguir el margen global. */
  function volverAMargenGlobal() {
    if (!hayMargenGlobal) return;
    const pct = margenGlobalPct as number;
    setSiguiendoGlobal(true);
    setMargen(dosDecimales(pct));
    const c = numero(costo);
    if (c > 0) setPrecio(dosDecimales(precioDesdeMargen(c, pct)));
  }

  const gananciaUsd = numero(precio) - numero(costo);
  const margenActual = margenSobreCosto(numero(costo), numero(precio));

  // ---- Etiquetas (chips) ----
  const [tags, setTags] = React.useState<string[]>(producto?.etiquetas ?? []);
  const [tagInput, setTagInput] = React.useState("");
  function addTag(raw: string) {
    const t = raw.trim().slice(0, 40);
    if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase()) && tags.length < 20) {
      setTags([...tags, t]);
    }
    setTagInput("");
  }
  function onTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === "Backspace" && !tagInput && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  }
  const sugerencias = etiquetasSugeridas.filter((s) => !tags.includes(s)).slice(0, 12);

  React.useEffect(() => {
    if (state.ok) {
      router.refresh();
      onDone(
        !editando && state.productoId
          ? {
              id: state.productoId,
              nombre: nombre.trim(),
              costoUsd: numero(costo),
              imagenUrl: preview,
            }
          : undefined,
      );
    }
    // Solo debe reaccionar a que el guardado terminó bien, no a cada tecleo
    // de nombre/costo/preview (esos ya están congelados en el momento del éxito).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok, state.productoId, router, onDone, editando]);

  /**
   * Sin conexión: escribe directo en local (PowerSync) en vez de invocar la
   * Server Action — no hay servidor disponible para revalidar unicidad de
   * código/código de barras (mismo trade-off que la venta offline). Lee la
   * foto del DOM en el momento del envío porque varios campos (categoría,
   * impuesto, proveedor, sucursal, IGTF, activo) son `<select>`/checkbox no
   * controlados.
   */
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!offline) return;
    e.preventDefault();
    if (!powerSyncDb) {
      toast.error("Sin conexión y sin base local disponible. Inténtalo de nuevo en unos segundos.");
      return;
    }
    if (!nombre.trim()) {
      toast.error("El nombre es obligatorio.");
      return;
    }

    const fd = new FormData(e.currentTarget);
    const numero = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace(",", ".")) || 0;

    setGuardandoLocal(true);
    try {
      const input = {
        tenantId,
        usuarioId,
        sucursalId: (fd.get("sucursal_id") as string) || sucursales[0]?.id || null,
        nombre: nombre.trim(),
        codigo: sku.trim() || null,
        categoriaId: (fd.get("categoria_id") as string) || null,
        tipoVenta,
        unidad: unidadValor,
        costoUsd: numero(fd.get("costo_usd")),
        precioUsd: numero(fd.get("precio_usd")),
        impuestoId: (fd.get("impuesto_id") as string) || impuestoIdDefault,
        aplicaIgtf: fd.get("aplica_igtf") === "1" || fd.get("aplica_igtf") === "on",
        proveedorId: (fd.get("proveedor_id") as string) || null,
        etiquetas: tags,
        codigos,
        activo: fd.get("activo") === "1" || fd.get("activo") === "on",
        usaMargenGlobal: siguiendoGlobal,
        stockMinimo: fd.get("stock_minimo") ? numero(fd.get("stock_minimo")) : undefined,
        stockInicial:
          !editando && fd.get("stock_inicial") ? numero(fd.get("stock_inicial")) : undefined,
      };

      if (editando && producto) {
        await actualizarProductoLocal(powerSyncDb, producto.id, input);
        toast.success("Producto guardado en este dispositivo. Se sincronizará al conectarte.");
        onDone();
      } else {
        const { productoId } = await crearProductoLocal(powerSyncDb, input);
        toast.success("Producto guardado en este dispositivo. Se sincronizará al conectarte.");
        onDone({
          id: productoId,
          nombre: input.nombre,
          costoUsd: input.costoUsd,
          imagenUrl: preview,
        });
      }
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `No se pudo guardar: ${err.message}`
          : "No se pudo guardar el producto.",
      );
    } finally {
      setGuardandoLocal(false);
    }
  }

  return (
    <>
      <form className="space-y-5" action={formAction} onSubmit={onSubmit} noValidate>
        <DialogHeader>
          <DialogTitle>{editando ? "Editar producto" : "Nuevo producto"}</DialogTitle>
          <DialogDescription>
            El precio base es en USD; el monto en bolívares se calcula con la tasa vigente.
          </DialogDescription>
        </DialogHeader>

        {producto ? <input type="hidden" name="id" value={producto.id} /> : null}
        <input type="hidden" name="codigo" value={sku} />
        <input type="hidden" name="codigos" value={codigos.join(",")} />
        <input type="hidden" name="tipo_venta" value={tipoVenta} />
        <input type="hidden" name="unidad" value={unidadValor} />
        <input type="hidden" name="etiquetas" value={tags.join(",")} />
        <input type="hidden" name="usa_margen_global" value={siguiendoGlobal ? "1" : "0"} />

        {offline ? (
          <div
            role="status"
            className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800"
          >
            <WifiOff className="size-4 shrink-0" aria-hidden />
            <span>
              <strong>Sin conexión</strong> — se guarda en este dispositivo y se sube solo cuando
              vuelva la señal.
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

        {/* Foto del producto */}
        <div className="flex items-center gap-4">
          <div className="bg-surface-2 border-border relative size-24 shrink-0 overflow-hidden rounded-lg border">
            {preview ? (
              <div
                role="img"
                aria-label="Vista previa del producto"
                className="size-full bg-cover bg-center"
                style={{ backgroundImage: `url("${preview}")` }}
              />
            ) : (
              <div className="text-muted-foreground flex size-full items-center justify-center">
                <ImageIcon className="size-7" aria-hidden />
              </div>
            )}
            {comprimiendo ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs font-medium text-white">
                Optimizando…
              </div>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Foto del producto (opcional)</Label>
            <input
              ref={fileRef}
              type="file"
              name="imagen"
              accept="image/*"
              className="hidden"
              onChange={onPick}
            />
            <input type="hidden" name="imagen_remove" value={removed ? "1" : ""} />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={comprimiendo}
                onClick={() => setFotoDialogOpen(true)}
              >
                <Camera className="size-4" />
                Tomar foto
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={comprimiendo}
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus className="size-4" />
                {preview ? "Cambiar foto" : "Subir foto"}
              </Button>
              {preview ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={comprimiendo}
                  onClick={quitarFoto}
                >
                  Quitar
                </Button>
              ) : null}
            </div>
            <p className="text-muted-foreground text-xs">
              Se optimiza automáticamente para pesar poco (WebP/JPG, ~640px).
            </p>
          </div>
        </div>

        {/* Nombre */}
        <div className="space-y-2">
          <Label htmlFor="nombre">Nombre</Label>
          <Input
            id="nombre"
            name="nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Harina de maíz 1kg"
            aria-invalid={Boolean(state.fieldErrors?.nombre)}
            required
          />
          {state.fieldErrors?.nombre ? (
            <p className="text-danger text-xs">{state.fieldErrors.nombre}</p>
          ) : null}
        </div>

        {/* SKU + categoría */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="sku">Código / SKU (opcional)</Label>
            <div className="flex gap-2">
              <Input
                id="sku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="ABC-0001"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => setSku(generarSku(nombre || "Producto", skuSugerido))}
              >
                <Sparkles className="size-4" />
                Generar
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="categoria_id">Categoría</Label>
              <button
                type="button"
                onClick={() => setCategoriaModalOpen(true)}
                className="text-accent-600 inline-flex items-center gap-1 text-xs font-medium hover:underline"
              >
                <PlusCircle className="size-3.5" aria-hidden />
                Nueva categoría
              </button>
            </div>
            <select
              id="categoria_id"
              name="categoria_id"
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">Sin categoría</option>
              {categoriasLista.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Códigos de barras (varios) */}
        <div className="space-y-2">
          <Label htmlFor="codigo_input">Códigos de barras (opcional)</Label>
          <div className="border-border focus-within:ring-ring flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5 focus-within:ring-2">
            <ScanLine className="text-muted-foreground ml-1 size-4 shrink-0" aria-hidden />
            {codigos.map((c) => (
              <span
                key={c}
                className="bg-surface-2 text-heading inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums"
              >
                {c}
                <button
                  type="button"
                  onClick={() => setCodigos(codigos.filter((x) => x !== c))}
                  aria-label={`Quitar ${c}`}
                  className="hover:text-danger"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <input
              id="codigo_input"
              value={codigoInput}
              onChange={(e) => setCodigoInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCodigo(codigoInput);
                }
              }}
              onBlur={() => codigoInput && addCodigo(codigoInput)}
              inputMode="numeric"
              placeholder={
                codigos.length === 0 ? "Escanea o escribe y pulsa Enter" : "Añadir otro…"
              }
              className="min-w-40 flex-1 bg-transparent py-0.5 text-sm tabular-nums outline-none"
            />
          </div>
          <p className="text-muted-foreground text-xs">
            Compatible con lector USB/Bluetooth. Un producto puede tener varias presentaciones.
          </p>
        </div>

        {/* Tipo de venta + unidad */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="tipo_venta_sel">Tipo de venta</Label>
            <select
              id="tipo_venta_sel"
              className={SELECT_CLASS}
              value={tipoVenta}
              onChange={(e) => onTipoVenta(e.target.value as "unidad" | "granel")}
            >
              {TIPOS_VENTA.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="unidad_sel">Unidad de medida</Label>
            <select
              id="unidad_sel"
              className={SELECT_CLASS}
              value={unidadSel}
              onChange={(e) => setUnidadSel(e.target.value)}
            >
              {unidadesDisponibles.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
              <option value={UNIDAD_OTRA}>Otra…</option>
            </select>
            {unidadSel === UNIDAD_OTRA ? (
              <Input
                aria-label="Unidad personalizada"
                value={unidadOtra}
                onChange={(e) => setUnidadOtra(e.target.value)}
                placeholder="Ej. fardo, rollo"
                className="mt-2"
                maxLength={32}
              />
            ) : null}
          </div>
        </div>

        {/* Precios y margen */}
        <div className="border-border bg-surface-2/40 space-y-3 rounded-lg border p-3">
          {hayMargenGlobal || producto?.usa_margen_global ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                  siguiendoGlobal
                    ? "bg-accent-500/12 text-accent-600"
                    : "bg-surface text-muted-foreground border-border border"
                }`}
              >
                {siguiendoGlobal
                  ? `Usando margen global (${dosDecimales(margenGlobalPct ?? 0)}%)`
                  : "Margen personalizado"}
              </span>
              {!siguiendoGlobal && hayMargenGlobal ? (
                <button
                  type="button"
                  onClick={volverAMargenGlobal}
                  className="text-accent-600 text-xs font-medium underline-offset-2 hover:underline"
                >
                  Volver al margen global ({dosDecimales(margenGlobalPct as number)}%)
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-3">
            <CampoMontoDual
              id="costo"
              label="Precio de compra (USD)"
              name="costo_usd"
              valorUsd={costo}
              onChangeUsd={onCosto}
              tasa={tasa}
            />
            <CampoMontoDual
              id="precio"
              label="Precio de venta (USD)"
              name="precio_usd"
              valorUsd={precio}
              onChangeUsd={onPrecio}
              tasa={tasa}
              ariaInvalid={Boolean(state.fieldErrors?.precio_usd)}
              required
            />
            <div className="space-y-1.5">
              <Label htmlFor="margen">Margen sobre costo</Label>
              <div className="relative">
                <Input
                  id="margen"
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  value={margen}
                  onChange={(e) => onMargen(e.target.value)}
                  placeholder="50"
                  className="pr-8 text-right tabular-nums"
                />
                <span
                  aria-hidden
                  className="text-muted-foreground pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm"
                >
                  %
                </span>
              </div>
            </div>
          </div>
          <p className="text-muted-foreground text-xs">
            {margenActual === null ? (
              "Indica compra y venta para ver la ganancia. Si fijas el margen, calculamos la venta."
            ) : (
              <>
                Ganancia por unidad:{" "}
                <span
                  className={
                    gananciaUsd >= 0 ? "text-success font-medium" : "text-danger font-medium"
                  }
                >
                  ${gananciaUsd.toFixed(2)}
                </span>{" "}
                · Margen <span className="font-medium">{margenActual.toFixed(1)}%</span>
              </>
            )}
          </p>
        </div>

        {/* Impuesto + IGTF */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="impuesto_id">Impuesto aplicable</Label>
            <select
              id="impuesto_id"
              name="impuesto_id"
              defaultValue={producto?.impuesto_id ?? impuestoIdDefault}
              className={SELECT_CLASS}
            >
              {impuestos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            {state.fieldErrors?.impuesto_id ? (
              <p className="text-danger text-xs">{state.fieldErrors.impuesto_id}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="aplica_igtf">IGTF en divisa</Label>
            <label className="border-border flex h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm">
              <input
                id="aplica_igtf"
                name="aplica_igtf"
                type="checkbox"
                value="1"
                defaultChecked={producto ? producto.aplica_igtf : aplicaIgtfDefault}
                className="size-4 accent-[var(--brand-500)]"
              />
              Aplica IGTF al pagar en divisa
            </label>
            <p className="text-muted-foreground text-xs">Efectivo USD o Zelle (3% configurable).</p>
          </div>
        </div>

        {/* Proveedor + estado */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="proveedor_id">Proveedor habitual (opcional)</Label>
            <select
              id="proveedor_id"
              name="proveedor_id"
              defaultValue={producto?.proveedor_id ?? ""}
              className={SELECT_CLASS}
            >
              <option value="">Sin proveedor</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="activo">Estado</Label>
            <label className="border-border flex h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm">
              <input
                id="activo"
                name="activo"
                type="checkbox"
                value="1"
                defaultChecked={producto ? producto.activo : true}
                className="size-4 accent-[var(--brand-500)]"
              />
              Producto activo (se puede vender)
            </label>
          </div>
        </div>

        {/* Stock */}
        <div className="grid gap-4 sm:grid-cols-3">
          {!editando ? (
            <div className="space-y-2">
              <Label htmlFor="stock_inicial">Stock inicial</Label>
              <Input
                id="stock_inicial"
                name="stock_inicial"
                type="number"
                step="0.001"
                min="0"
                inputMode="decimal"
                placeholder="0"
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="stock_minimo">Stock mínimo (alerta)</Label>
            <Input
              id="stock_minimo"
              name="stock_minimo"
              type="number"
              step="0.001"
              min="0"
              inputMode="decimal"
              defaultValue={producto?.stock_minimo != null ? String(producto.stock_minimo) : ""}
              placeholder="0"
            />
          </div>
          {sucursales.length > 1 ? (
            <div className="space-y-2">
              <Label htmlFor="sucursal_id">Sucursal</Label>
              <select id="sucursal_id" name="sucursal_id" className={SELECT_CLASS}>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
          ) : sucursales.length === 1 ? (
            <input type="hidden" name="sucursal_id" value={sucursales[0]?.id ?? ""} />
          ) : null}
        </div>

        {/* Etiquetas */}
        <div className="space-y-2">
          <Label htmlFor="etiqueta_input">Etiquetas (opcional)</Label>
          <div className="border-border focus-within:ring-ring flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5 focus-within:ring-2">
            {tags.map((t) => (
              <span
                key={t}
                className="bg-accent-500/12 text-accent-600 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
              >
                {t}
                <button
                  type="button"
                  onClick={() => setTags(tags.filter((x) => x !== t))}
                  aria-label={`Quitar ${t}`}
                  className="hover:text-danger"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <input
              id="etiqueta_input"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={onTagKeyDown}
              onBlur={() => tagInput && addTag(tagInput)}
              placeholder={tags.length === 0 ? "promoción, perecedero, frío…" : "Añadir…"}
              className="min-w-24 flex-1 bg-transparent py-0.5 text-sm outline-none"
            />
          </div>
          {sugerencias.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {sugerencias.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => addTag(s)}
                  className="border-border text-muted-foreground hover:border-accent-500 hover:text-accent-600 rounded-full border px-2 py-0.5 text-xs"
                >
                  + {s}
                </button>
              ))}
            </div>
          ) : null}
          <p className="text-muted-foreground text-xs">
            Pulsa Enter o coma para agregar. Sirven para agrupar y filtrar.
          </p>
        </div>

        <DialogFooter>
          <SubmitButton disabled={guardandoLocal}>
            {guardandoLocal ? "Guardando…" : editando ? "Guardar cambios" : "Crear producto"}
          </SubmitButton>
        </DialogFooter>
      </form>
      <TomarFotoDialog
        open={fotoDialogOpen}
        onOpenChange={setFotoDialogOpen}
        onCapturar={onCapturarFoto}
      />
      <Dialog open={categoriaModalOpen} onOpenChange={setCategoriaModalOpen}>
        <DialogContent className="max-w-md">
          <CategoriaForm tenantId={tenantId} onDone={onCategoriaCreada} />
        </DialogContent>
      </Dialog>
    </>
  );
}
