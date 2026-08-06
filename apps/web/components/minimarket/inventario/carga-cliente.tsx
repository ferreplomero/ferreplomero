"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { Badge, Button, Card, Label } from "@arkiteq/ui";
import { SubmitButton } from "@/components/auth/submit-button";
import {
  cargaMasiva,
  previsualizarCargaMasiva,
  type AccionDuplicado,
  type CargaResult,
  type FilaPreview,
  type PreviewCargaResult,
  type ResolucionesCarga,
} from "@/app/(vertical)/minimarket/inventario/actions";
import { descargarPlantillaCarga, leerArchivoComoCsv } from "@/lib/minimarket/plantilla-carga";

const EJEMPLO = `nombre,sku,codigo_barras,categoria,tipo_venta,unidad,costo_usd,precio_usd,impuesto,aplica_igtf,proveedor,stock_inicial,stock_minimo,etiquetas,margen_pct,tasa
"Café Fama de América 500g",CAF-500,7591234500017,Abarrotes,unidad,unidad,2.60,3.50,iva,si,Distribuidora Polar,12,4,perecedero,,bcv
"Leche en polvo 900g",LEC-900,7591234500024,Abarrotes,unidad,unidad,4.10,5.20,exento,si,,8,3,,,
"Queso blanco (granel)",QUE-GRA,,Charcutería,granel,kg,3.20,,exento,si,Lácteos Los Andes,10,2,frío;perecedero,50,
"Jugo Yukery 1.5L",JUG-15,7591234500031,Bebidas,unidad,unidad,1.00,1.40,iva,si,,20,6,frío;promoción,,euro
"Papel higiénico Rosal x4",PAP-X4,7591234500048;7591234509999,Limpieza,unidad,paquete,1.60,2.10,iva,no,,15,5,,,`;

const TEXTAREA_CLASS =
  "border-border bg-background focus-visible:ring-ring min-h-40 w-full rounded-md border p-3 font-mono text-xs focus-visible:outline-none focus-visible:ring-2";

const SELECT_CLASS =
  "border-border bg-background focus-visible:ring-ring h-8 rounded-md border px-2 text-xs focus-visible:outline-none focus-visible:ring-2";

const ESTADO_BADGE: Record<
  FilaPreview["estado"],
  { variant: "success" | "warning" | "danger"; texto: string }
> = {
  nuevo: { variant: "success", texto: "Nuevo" },
  duplicado: { variant: "warning", texto: "Ya existe" },
  error: { variant: "danger", texto: "Error" },
};

const TASA_LABEL: Record<NonNullable<FilaPreview["tasa_tipo"]>, string> = {
  bcv: "BCV",
  euro: "Euro",
  manual: "Personalizada",
};

export function CargaCliente() {
  const router = useRouter();
  const [state, formAction] = useActionState<CargaResult, FormData>(cargaMasiva, {});

  const [csv, setCsv] = React.useState("");
  const [nombreArchivo, setNombreArchivo] = React.useState<string | null>(null);
  const [errorArchivo, setErrorArchivo] = React.useState<string | null>(null);
  const [avanzadoAbierto, setAvanzadoAbierto] = React.useState(false);

  const [preview, setPreview] = React.useState<PreviewCargaResult | null>(null);
  const [errorPreview, setErrorPreview] = React.useState<string | null>(null);
  const [validando, startValidar] = React.useTransition();
  const [resoluciones, setResoluciones] = React.useState<Record<number, AccionDuplicado>>({});

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  function reiniciarPreview() {
    setPreview(null);
    setErrorPreview(null);
    setResoluciones({});
  }

  function actualizarCsv(nuevo: string, archivo: string | null) {
    setCsv(nuevo);
    setNombreArchivo(archivo);
    setErrorArchivo(null);
    reiniciarPreview();
  }

  async function manejarArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    try {
      const texto = await leerArchivoComoCsv(archivo);
      actualizarCsv(texto, archivo.name);
    } catch {
      setErrorArchivo(
        "No se pudo leer el archivo. Verifica que sea un .xlsx o .csv válido (usa la plantilla descargada).",
      );
    }
  }

  function validar() {
    setErrorPreview(null);
    startValidar(async () => {
      const res = await previsualizarCargaMasiva(csv);
      if (res.error) {
        setErrorPreview(res.error);
        setPreview(null);
        return;
      }
      setPreview(res);
      const iniciales: Record<number, AccionDuplicado> = {};
      for (const f of res.filas ?? []) {
        if (f.estado === "duplicado") iniciales[f.linea] = "omitir";
      }
      setResoluciones(iniciales);
    });
  }

  const resolucionesJson = React.useMemo(() => {
    const mapa: ResolucionesCarga = {};
    for (const f of preview?.filas ?? []) {
      if (f.estado === "duplicado") {
        mapa[String(f.linea)] = {
          accion: resoluciones[f.linea] ?? "omitir",
          productoId: f.duplicado_id,
        };
      }
    }
    return JSON.stringify(mapa);
  }, [preview, resoluciones]);

  const importables =
    (preview?.resumen?.nuevos ?? 0) +
    Object.values(resoluciones).filter((a) => a === "actualizar").length;

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="text-accent-600 size-5" aria-hidden />
          <h2 className="text-heading font-medium">Cómo cargar tus productos</h2>
        </div>
        <ol className="text-muted-foreground list-inside list-decimal space-y-1 text-sm">
          <li>
            <strong className="text-heading">Descarga la plantilla</strong> — trae las columnas
            exactas que el sistema necesita, con productos de ejemplo ya llenos.
          </li>
          <li>
            <strong className="text-heading">Copia tus productos</strong> desde tu propio Excel y
            pégalos en la plantilla (borra las filas de ejemplo).
          </li>
          <li>
            <strong className="text-heading">Súbela aquí</strong> y revisa la vista previa antes de
            confirmar.
          </li>
        </ol>
        <p className="text-muted-foreground text-xs">
          Si no conoces el precio de venta, deja esa celda vacía y llena{" "}
          <strong className="text-heading">margen de ganancia (%)</strong> junto al costo — lo
          calculamos por ti. La columna <strong className="text-heading">tasa</strong> (BCV, Euro o
          Personalizada) es solo para mostrarte el precio en bolívares en la vista previa. Las
          categorías que no existan todavía se crean solas.
        </p>
        <Button type="button" variant="outline" onClick={() => descargarPlantillaCarga()}>
          <Download className="size-4" aria-hidden />
          Descargar plantilla de ejemplo
        </Button>
      </Card>

      <Card className="space-y-3 p-5">
        <Label htmlFor="archivo-carga">Sube tu archivo (.xlsx o .csv)</Label>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="primary" onClick={() => fileInputRef.current?.click()}>
            <Upload className="size-4" aria-hidden />
            Elegir archivo
          </Button>
          <input
            ref={fileInputRef}
            id="archivo-carga"
            type="file"
            accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={manejarArchivo}
          />
          {nombreArchivo ? (
            <span className="text-muted-foreground text-sm">
              Archivo cargado: <strong className="text-heading">{nombreArchivo}</strong>
            </span>
          ) : (
            <span className="text-muted-foreground text-sm">Ningún archivo seleccionado.</span>
          )}
        </div>
        {errorArchivo ? (
          <p role="alert" className="bg-danger/10 text-danger rounded-md px-3 py-2.5 text-sm">
            {errorArchivo}
          </p>
        ) : null}

        <button
          type="button"
          className="text-accent-600 self-start text-xs font-medium underline-offset-2 hover:underline"
          onClick={() => setAvanzadoAbierto((v) => !v)}
        >
          {avanzadoAbierto ? "Ocultar" : "Avanzado: pegar CSV en vez de subir un archivo"}
        </button>
        {avanzadoAbierto ? (
          <div className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted-foreground text-xs">
                Una fila por producto, separada por comas (la primera fila puede ser el encabezado).
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start sm:self-auto"
                onClick={() => actualizarCsv(EJEMPLO, null)}
              >
                Usar ejemplo
              </Button>
            </div>
            <textarea
              value={csv}
              onChange={(e) => actualizarCsv(e.target.value, null)}
              placeholder={EJEMPLO}
              className={TEXTAREA_CLASS}
              spellCheck={false}
            />
          </div>
        ) : null}

        {csv.trim().length > 0 ? (
          <div className="flex justify-end">
            <Button type="button" onClick={validar} disabled={validando}>
              {validando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Validar productos
            </Button>
          </div>
        ) : null}

        {errorPreview ? (
          <p
            role="alert"
            className="bg-danger/10 text-danger flex items-center gap-2 rounded-md px-3 py-2.5 text-sm"
          >
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            {errorPreview}
          </p>
        ) : null}
      </Card>

      {preview?.filas ? (
        <Card className="space-y-3 p-5">
          <h2 className="text-heading font-medium">Vista previa</h2>
          <p className="text-muted-foreground text-sm">
            Se importarán <strong className="text-heading">{importables}</strong> producto(s) de{" "}
            {preview.resumen?.total ?? 0} fila(s).{" "}
            {preview.resumen && preview.resumen.errores > 0
              ? `${preview.resumen.errores} fila(s) con errores no se importarán. `
              : ""}
            {preview.resumen && preview.resumen.duplicados > 0
              ? `${preview.resumen.duplicados} producto(s) ya existen — elige qué hacer con cada uno abajo.`
              : ""}
          </p>
          {preview.resumen && preview.resumen.categoriasNuevas.length > 0 ? (
            <p className="text-accent-600 text-sm">
              Se crearán {preview.resumen.categoriasNuevas.length} categoría(s) nueva(s):{" "}
              {preview.resumen.categoriasNuevas.join(", ")}.
            </p>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2 font-medium">Fila</th>
                  <th className="px-3 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 font-medium">Categoría</th>
                  <th className="px-3 py-2 text-right font-medium">Precio</th>
                  <th className="px-3 py-2 text-right font-medium">Bs (referencia)</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Detalle / Acción</th>
                </tr>
              </thead>
              <tbody>
                {preview.filas.map((f) => {
                  const badge = ESTADO_BADGE[f.estado];
                  const notas = f.notas ?? [];
                  return (
                    <tr key={f.linea} className="border-border/70 border-b last:border-0">
                      <td className="text-muted-foreground px-3 py-2 tabular-nums">{f.linea}</td>
                      <td className="text-heading px-3 py-2">{f.nombre || "—"}</td>
                      <td className="text-muted-foreground px-3 py-2">
                        {f.categoria || "—"}
                        {f.categoria_nueva ? (
                          <span className="text-accent-600 ml-1 text-xs">(nueva)</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {Number.isFinite(f.precio_usd) ? `$${f.precio_usd.toFixed(2)}` : "—"}
                        {f.precio_calculado ? (
                          <span className="text-accent-600 block text-xs font-normal">
                            (por margen)
                          </span>
                        ) : null}
                      </td>
                      <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                        {f.precio_bs != null ? (
                          <>
                            {`Bs ${f.precio_bs.toFixed(2)}`}
                            {f.tasa_tipo ? (
                              <span className="block text-xs">{TASA_LABEL[f.tasa_tipo]}</span>
                            ) : null}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={badge.variant}>{badge.texto}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        {f.estado === "duplicado" ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-muted-foreground text-xs">{f.motivo}</span>
                            <select
                              className={SELECT_CLASS}
                              value={resoluciones[f.linea] ?? "omitir"}
                              onChange={(e) =>
                                setResoluciones((prev) => ({
                                  ...prev,
                                  [f.linea]: e.target.value as AccionDuplicado,
                                }))
                              }
                            >
                              <option value="omitir">Omitir (no tocar el existente)</option>
                              <option value="actualizar">Actualizar el producto existente</option>
                            </select>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">{f.motivo ?? "—"}</span>
                        )}
                        {notas.map((n) => (
                          <span key={n} className="text-warning mt-1 block text-xs">
                            {n}
                          </span>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <form action={formAction} className="space-y-3">
            <input type="hidden" name="csv" value={csv} />
            <input type="hidden" name="resoluciones" value={resolucionesJson} />

            {state.error ? (
              <p
                role="alert"
                className="bg-danger/10 text-danger flex items-center gap-2 rounded-md px-3 py-2.5 text-sm"
              >
                <AlertCircle className="size-4 shrink-0" aria-hidden />
                {state.error}
              </p>
            ) : null}

            {state.ok ? (
              <div className="border-border space-y-2 rounded-md border p-4">
                <p className="text-success flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2 className="size-4" aria-hidden />
                  Se crearon {state.creados ?? 0}, se actualizaron {state.actualizados ?? 0} y se
                  omitieron {state.omitidos ?? 0} producto(s).
                </p>
                {state.errores && state.errores.length > 0 ? (
                  <div className="text-muted-foreground text-xs">
                    <p className="text-warning font-medium">
                      {state.errores.length} fila(s) con problemas:
                    </p>
                    <ul className="mt-1 list-inside list-disc space-y-0.5">
                      {state.errores.slice(0, 10).map((e) => (
                        <li key={e.linea}>
                          Fila {e.linea}: {e.motivo}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <Button asChild variant="outline" size="sm">
                  <Link href="/minimarket/inventario">Ver inventario</Link>
                </Button>
              </div>
            ) : (
              <div className="flex justify-end">
                <SubmitButton disabled={importables === 0}>Confirmar importación</SubmitButton>
              </div>
            )}
          </form>
        </Card>
      ) : null}
    </div>
  );
}
