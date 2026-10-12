"use client";

import * as React from "react";
import JsBarcode from "jsbarcode";
import { Printer, Search } from "lucide-react";
import { Button, Card, Input, Label } from "@arkiteq/ui";
import {
  escalaNombreEtiqueta,
  fmtBsEtiqueta,
  fmtUsdEtiqueta,
  leyendaIvaEtiqueta,
  precioEtiqueta,
  TAMANOS_ETIQUETA,
  type ModoImpresionEtiqueta,
  type MonedaEtiqueta,
  type TamanoEtiqueta,
} from "@/lib/minimarket/etiquetas";

export interface ProductoEtiqueta {
  id: string;
  nombre: string;
  sku: string | null;
  codigoBarras: string | null;
  /** Precio guardado del producto, en USD y sin IVA. */
  precioUsd: number;
  impuestoId: string;
  categoriaId: string | null;
  /** Stock total (entero, nunca negativo) — para el atajo "copias = stock". */
  stock: number;
}

interface EtiquetasClienteProps {
  productos: ProductoEtiqueta[];
  categorias: { id: string; nombre: string }[];
  tasa: number | null;
  ivaPct: number;
  /** Si el negocio cobra IVA en sus ventas (solo informativo aquí). */
  ivaActivo: boolean;
  nombreNegocio: string;
  idsIniciales: string[];
}

interface OpcionesEtiqueta {
  tamano: TamanoEtiqueta;
  moneda: MonedaEtiqueta;
  conIva: boolean;
  mostrarBarras: boolean;
  mostrarSku: boolean;
  mostrarNegocio: boolean;
  modo: ModoImpresionEtiqueta;
}

const OPCIONES_DEFAULT: OpcionesEtiqueta = {
  tamano: "mediana",
  moneda: "ambas",
  conIva: true,
  mostrarBarras: true,
  mostrarSku: true,
  mostrarNegocio: true,
  modo: "hoja",
};

const CLAVE_OPCIONES = "ferreplomero:etiquetas:opciones";
/** Tope de etiquetas por impresión: protege el navegador de una vista previa enorme. */
const MAX_ETIQUETAS = 1000;

const SELECT_CLASS =
  "border-border bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2";

/** Opciones guardadas por este navegador (comodidad: el mismo formato la próxima vez). */
function leerOpciones(): OpcionesEtiqueta {
  try {
    const crudo = window.localStorage.getItem(CLAVE_OPCIONES);
    if (!crudo) return OPCIONES_DEFAULT;
    const o = JSON.parse(crudo) as Partial<OpcionesEtiqueta>;
    return {
      tamano: o.tamano && o.tamano in TAMANOS_ETIQUETA ? o.tamano : OPCIONES_DEFAULT.tamano,
      moneda: o.moneda === "bs" || o.moneda === "usd" || o.moneda === "ambas" ? o.moneda : "ambas",
      conIva: typeof o.conIva === "boolean" ? o.conIva : true,
      mostrarBarras: typeof o.mostrarBarras === "boolean" ? o.mostrarBarras : true,
      mostrarSku: typeof o.mostrarSku === "boolean" ? o.mostrarSku : true,
      mostrarNegocio: typeof o.mostrarNegocio === "boolean" ? o.mostrarNegocio : true,
      modo: o.modo === "rollo" ? "rollo" : "hoja",
    };
  } catch {
    return OPCIONES_DEFAULT;
  }
}

/** Grupo de botones excluyentes (radio) con el estilo de la app. */
function Segmentado<T extends string>({
  etiqueta,
  valor,
  opciones,
  onChange,
}: {
  etiqueta: string;
  valor: T;
  opciones: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-heading text-sm font-medium">{etiqueta}</p>
      <div
        role="radiogroup"
        aria-label={etiqueta}
        className="border-border flex flex-wrap overflow-hidden rounded-md border text-sm"
      >
        {opciones.map(([v, texto]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={valor === v}
            onClick={() => onChange(v)}
            className={
              valor === v
                ? "bg-primary text-primary-foreground flex-1 whitespace-nowrap px-3 py-2 font-medium"
                : "text-muted-foreground hover:bg-muted flex-1 whitespace-nowrap px-3 py-2"
            }
          >
            {texto}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Código de barras CODE128 en SVG (escala sin perder nitidez al imprimir). */
function CodigoBarras({ valor, altoMm }: { valor: string; altoMm: number }) {
  const ref = React.useRef<SVGSVGElement>(null);
  const [valido, setValido] = React.useState(true);
  React.useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, valor, {
        format: "CODE128",
        displayValue: false,
        margin: 0,
        height: 40,
        width: 2,
      });
      setValido(true);
    } catch {
      // Un código con caracteres que CODE128 no admite no rompe la etiqueta:
      // simplemente no se dibuja.
      setValido(false);
    }
  }, [valor]);
  if (!valido) return null;
  return (
    <svg
      ref={ref}
      className="etiqueta-barras"
      preserveAspectRatio="none"
      style={{ width: "100%", height: `${altoMm}mm` }}
      aria-label={`Código de barras ${valor}`}
    />
  );
}

function Etiqueta({
  producto,
  opciones,
  tasa,
  ivaPct,
  nombreNegocio,
}: {
  producto: ProductoEtiqueta;
  opciones: OpcionesEtiqueta;
  tasa: number | null;
  ivaPct: number;
  nombreNegocio: string;
}) {
  const medidas = TAMANOS_ETIQUETA[opciones.tamano];
  const precio = precioEtiqueta({
    precioUsd: producto.precioUsd,
    impuestoId: producto.impuestoId,
    ivaPct,
    conIva: opciones.conIva,
    tasa,
  });
  const escala = escalaNombreEtiqueta(producto.nombre, opciones.tamano);
  const usdTexto = fmtUsdEtiqueta(precio.usd);
  const bsTexto = precio.bs !== null ? fmtBsEtiqueta(precio.bs) : null;
  // Precio principal (grande) y secundario según la moneda elegida. Si no
  // hay tasa registrada, "solo Bs" cae a USD para no imprimir una etiqueta vacía.
  const principal = opciones.moneda === "bs" && bsTexto ? bsTexto : usdTexto;
  const secundario = opciones.moneda === "ambas" ? bsTexto : null;
  const barras = opciones.mostrarBarras && producto.codigoBarras ? producto.codigoBarras : null;

  return (
    <div
      className="etiqueta"
      style={{
        width: `${medidas.anchoMm}mm`,
        height: `${medidas.altoMm}mm`,
        padding: `${medidas.paddingMm}mm ${medidas.paddingMm + 0.5}mm`,
        gap: `${medidas.gapMm}mm`,
      }}
    >
      {opciones.mostrarNegocio ? (
        <p className="etiqueta-negocio" style={{ fontSize: `${medidas.negocioPt}pt` }}>
          {nombreNegocio}
        </p>
      ) : null}
      <p
        className="etiqueta-producto"
        style={{ fontSize: `${(medidas.productoPt * escala).toFixed(2)}pt` }}
      >
        {producto.nombre}
      </p>
      <div className="etiqueta-precios">
        <p className="etiqueta-precio" style={{ fontSize: `${medidas.precioPt}pt` }}>
          {principal}
        </p>
        {secundario ? (
          <p className="etiqueta-secundario" style={{ fontSize: `${medidas.secundarioPt}pt` }}>
            {secundario}
          </p>
        ) : null}
      </div>
      <div className="etiqueta-pie" style={{ fontSize: `${medidas.negocioPt}pt` }}>
        <span>{leyendaIvaEtiqueta(opciones.conIva, precio.exento)}</span>
        {opciones.mostrarSku && producto.sku ? <span>{producto.sku}</span> : null}
      </div>
      {barras ? <CodigoBarras valor={barras} altoMm={medidas.barrasMm} /> : null}
    </div>
  );
}

export function EtiquetasCliente({
  productos,
  categorias,
  tasa,
  ivaPct,
  ivaActivo,
  nombreNegocio,
  idsIniciales,
}: EtiquetasClienteProps) {
  const [opciones, setOpciones] = React.useState<OpcionesEtiqueta>(OPCIONES_DEFAULT);
  const [opcionesListas, setOpcionesListas] = React.useState(false);
  // Copias por producto seleccionado (id → copias). Si llegan ids desde la
  // selección masiva del inventario, entran preseleccionados con 1 copia.
  const [copias, setCopias] = React.useState<Map<string, number>>(() => {
    const existentes = new Set(productos.map((p) => p.id));
    return new Map(idsIniciales.filter((id) => existentes.has(id)).map((id) => [id, 1]));
  });
  const [busqueda, setBusqueda] = React.useState("");
  const [categoriaId, setCategoriaId] = React.useState("");

  React.useEffect(() => {
    setOpciones(leerOpciones());
    setOpcionesListas(true);
  }, []);

  React.useEffect(() => {
    if (!opcionesListas) return;
    try {
      window.localStorage.setItem(CLAVE_OPCIONES, JSON.stringify(opciones));
    } catch {
      // Sin almacenamiento disponible: las opciones solo duran esta visita.
    }
  }, [opciones, opcionesListas]);

  const cambiar = <K extends keyof OpcionesEtiqueta>(clave: K, valor: OpcionesEtiqueta[K]) =>
    setOpciones((o) => ({ ...o, [clave]: valor }));

  const filtrados = React.useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productos.filter(
      (p) =>
        (!categoriaId || p.categoriaId === categoriaId) &&
        (!q ||
          p.nombre.toLowerCase().includes(q) ||
          (p.sku ?? "").toLowerCase().includes(q) ||
          (p.codigoBarras ?? "").toLowerCase().includes(q)),
    );
  }, [productos, busqueda, categoriaId]);

  const todosFiltradosSeleccionados =
    filtrados.length > 0 && filtrados.every((p) => copias.has(p.id));

  function alternar(id: string) {
    setCopias((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, 1);
      return next;
    });
  }

  function alternarFiltrados() {
    setCopias((prev) => {
      const next = new Map(prev);
      if (todosFiltradosSeleccionados) filtrados.forEach((p) => next.delete(p.id));
      else filtrados.forEach((p) => next.set(p.id, next.get(p.id) ?? 1));
      return next;
    });
  }

  function fijarCopias(id: string, valor: number) {
    setCopias((prev) => {
      const next = new Map(prev);
      next.set(id, Math.min(500, Math.max(1, Math.floor(valor) || 1)));
      return next;
    });
  }

  function copiasSegunStock() {
    setCopias((prev) => {
      const next = new Map(prev);
      for (const p of productos) if (next.has(p.id)) next.set(p.id, Math.max(1, p.stock));
      return next;
    });
  }

  // Lista final de etiquetas a imprimir (cada copia es una etiqueta).
  const etiquetas = React.useMemo(() => {
    const lista: ProductoEtiqueta[] = [];
    for (const p of productos) {
      const n = copias.get(p.id);
      if (!n) continue;
      for (let i = 0; i < n && lista.length < MAX_ETIQUETAS; i++) lista.push(p);
    }
    return lista;
  }, [productos, copias]);
  const totalPedidas = Array.from(copias.values()).reduce((s, n) => s + n, 0);

  const medidas = TAMANOS_ETIQUETA[opciones.tamano];
  const usdLista = (p: ProductoEtiqueta) =>
    fmtUsdEtiqueta(
      precioEtiqueta({
        precioUsd: p.precioUsd,
        impuestoId: p.impuestoId,
        ivaPct,
        conIva: opciones.conIva,
        tasa,
      }).usd,
    );

  // Reglas de impresión según el modo: hoja carta en cuadrícula o rollo de
  // etiquetas (una por página del tamaño exacto de la etiqueta).
  const cssImpresion =
    opciones.modo === "rollo"
      ? `@page { size: ${medidas.anchoMm}mm ${medidas.altoMm}mm; margin: 0; }
         @media print {
           .hoja-etiquetas { display: block !important; gap: 0 !important; }
           .hoja-etiquetas .etiqueta { border: 0 !important; break-after: page; page-break-after: always; }
           .hoja-etiquetas .etiqueta:last-child { break-after: auto; page-break-after: auto; }
         }`
      : `@page { size: letter; margin: 8mm; }`;

  return (
    <div className="space-y-6">
      <style>{`
        .hoja-etiquetas { display: flex; flex-wrap: wrap; gap: 0; align-content: flex-start; }
        .etiqueta {
          box-sizing: border-box; overflow: hidden; background: #fff; color: #000;
          border: 0.2mm dashed #9ca3af; padding: 1.5mm 2mm;
          display: flex; flex-direction: column; gap: 0.4mm;
          break-inside: avoid; page-break-inside: avoid;
          font-family: ui-sans-serif, system-ui, sans-serif;
          -webkit-print-color-adjust: exact; print-color-adjust: exact;
        }
        .etiqueta p { margin: 0; color: #000; }
        .etiqueta-negocio { font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: clip; }
        .etiqueta-producto { font-weight: 600; line-height: 1.12; word-break: normal; overflow-wrap: break-word; }
        .etiqueta-precios { margin-top: auto; }
        .etiqueta-precio { font-weight: 800; line-height: 1.05; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .etiqueta-secundario { font-weight: 600; line-height: 1.1; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .etiqueta-pie { display: flex; justify-content: space-between; gap: 2mm; line-height: 1.1; white-space: nowrap; }
        .etiqueta-barras { display: block; }
        @media screen and (max-width: 480px) { .hoja-etiquetas { zoom: 0.8; } }
        @media print {
          body { background: #fff !important; }
          .hoja-etiquetas { zoom: 1 !important; }
        }
        ${cssImpresion}
      `}</style>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] print:hidden">
        {/* Opciones */}
        <Card className="space-y-4 p-5">
          <h2 className="text-heading text-base font-medium">Formato de la etiqueta</h2>
          <Segmentado
            etiqueta="Tamaño"
            valor={opciones.tamano}
            opciones={[
              ["pequena", "Pequeña"],
              ["mediana", "Mediana"],
              ["grande", "Grande"],
            ]}
            onChange={(v) => cambiar("tamano", v)}
          />
          <p className="text-muted-foreground -mt-2 text-xs">{medidas.etiqueta}</p>
          <Segmentado
            etiqueta="Moneda"
            valor={opciones.moneda}
            opciones={[
              ["bs", "Solo Bs"],
              ["usd", "Solo USD"],
              ["ambas", "Ambas"],
            ]}
            onChange={(v) => cambiar("moneda", v)}
          />
          {opciones.moneda !== "usd" && !tasa ? (
            <p className="text-warning text-xs">
              No hay una tasa registrada: las etiquetas mostrarán solo el precio en USD.
            </p>
          ) : null}
          <Segmentado
            etiqueta="Precio"
            valor={opciones.conIva ? "con" : "sin"}
            opciones={[
              ["con", `Con IVA (${ivaPct} %)`],
              ["sin", "Sin IVA"],
            ]}
            onChange={(v) => cambiar("conIva", v === "con")}
          />
          {!ivaActivo && opciones.conIva ? (
            <p className="text-muted-foreground -mt-2 text-xs">
              Tu negocio no cobra IVA en las ventas; el precio con IVA se calcula con el {ivaPct} %
              configurado.
            </p>
          ) : null}
          <div className="space-y-2">
            <p className="text-heading text-sm font-medium">Mostrar en la etiqueta</p>
            {(
              [
                ["mostrarBarras", "Código de barras"],
                ["mostrarSku", "Código / SKU"],
                ["mostrarNegocio", "Nombre del negocio"],
              ] as const
            ).map(([clave, texto]) => (
              <label key={clave} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={opciones[clave]}
                  onChange={(e) => cambiar(clave, e.target.checked)}
                  className="size-4"
                />
                {texto}
              </label>
            ))}
          </div>
          <Segmentado
            etiqueta="Impresión"
            valor={opciones.modo}
            opciones={[
              ["hoja", "Hoja carta"],
              ["rollo", "Impresora de etiquetas"],
            ]}
            onChange={(v) => cambiar("modo", v)}
          />
          <p className="text-muted-foreground -mt-2 text-xs">
            {opciones.modo === "hoja"
              ? "Varias etiquetas por hoja carta, con línea punteada para recortar."
              : `Una etiqueta por página de ${medidas.anchoMm} × ${medidas.altoMm} mm. Configura el mismo tamaño de papel en tu impresora de etiquetas.`}
          </p>
        </Card>

        {/* Productos */}
        <Card className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-heading text-base font-medium">Productos</h2>
            <span className="text-muted-foreground text-sm">
              {copias.size} seleccionado{copias.size === 1 ? "" : "s"}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="relative">
              <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o código"
                className="pl-9"
                aria-label="Buscar productos"
              />
            </div>
            <select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              className={SELECT_CLASS}
              aria-label="Filtrar por categoría"
            >
              <option value="">Todas las categorías</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={alternarFiltrados}
              disabled={filtrados.length === 0}
            >
              {todosFiltradosSeleccionados ? "Quitar los filtrados" : "Seleccionar los filtrados"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copiasSegunStock}
              disabled={copias.size === 0}
            >
              Copias según stock
            </Button>
            {copias.size > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCopias(new Map())}
              >
                Limpiar selección
              </Button>
            ) : null}
          </div>

          {filtrados.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              No hay productos que coincidan con la búsqueda.
            </p>
          ) : (
            <ul className="border-border divide-border max-h-96 divide-y overflow-y-auto rounded-md border">
              {filtrados.map((p) => {
                const seleccionado = copias.has(p.id);
                return (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={seleccionado}
                      onChange={() => alternar(p.id)}
                      className="size-4 shrink-0"
                      aria-label={`Seleccionar ${p.nombre}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-heading text-sm font-medium">{p.nombre}</p>
                      <p className="text-muted-foreground text-xs">
                        <span className="whitespace-nowrap tabular-nums">{usdLista(p)}</span>
                        {p.sku ? <span className="whitespace-nowrap"> · {p.sku}</span> : null}
                        <span className="whitespace-nowrap"> · Stock {p.stock}</span>
                      </p>
                    </div>
                    {seleccionado ? (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Label htmlFor={`copias-${p.id}`} className="text-muted-foreground text-xs">
                          Copias
                        </Label>
                        <Input
                          id={`copias-${p.id}`}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={500}
                          value={copias.get(p.id) ?? 1}
                          onChange={(e) => fijarCopias(p.id, Number(e.target.value))}
                          className="h-8 w-16 text-right text-sm"
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Vista previa + impresión */}
      <Card className="space-y-4 p-5 print:border-0 print:p-0 print:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div>
            <h2 className="text-heading text-base font-medium">Vista previa</h2>
            <p className="text-muted-foreground text-sm">
              {etiquetas.length === 0
                ? "Selecciona al menos un producto."
                : `${etiquetas.length} etiqueta${etiquetas.length === 1 ? "" : "s"} · tamaño real`}
            </p>
            {totalPedidas > MAX_ETIQUETAS ? (
              <p className="text-warning text-xs">
                Se muestran las primeras {MAX_ETIQUETAS} etiquetas. Imprime el resto en otra tanda.
              </p>
            ) : null}
          </div>
          <Button type="button" onClick={() => window.print()} disabled={etiquetas.length === 0}>
            <Printer className="mr-1.5 size-4" />
            Imprimir etiquetas
          </Button>
        </div>
        <div className="bg-surface-2 overflow-hidden rounded-md p-3 print:bg-transparent print:p-0">
          <div className="hoja-etiquetas" data-modo={opciones.modo}>
            {etiquetas.map((p, i) => (
              <Etiqueta
                key={`${p.id}-${i}`}
                producto={p}
                opciones={opciones}
                tasa={tasa}
                ivaPct={ivaPct}
                nombreNegocio={nombreNegocio}
              />
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
