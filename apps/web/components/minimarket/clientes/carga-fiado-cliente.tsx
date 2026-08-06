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
  cargaFiados,
  previsualizarCargaFiados,
  type CargaFiadosResult,
  type FilaPreviewFiado,
  type PreviewCargaFiadosResult,
} from "@/app/(vertical)/minimarket/clientes/actions";
import { leerArchivoComoFilas } from "@/lib/minimarket/plantilla-carga";
import { descargarPlantillaFiados } from "@/lib/minimarket/plantilla-carga-fiados";
import {
  CAMPO_LABEL,
  CAMPOS_CANONICOS,
  detectarFilaEncabezado,
  detectarMapeoColumnas,
  extraerTasaDeResumen,
  filasACsvCanonico,
  normalizarFilasFiado,
  type CampoCanonico,
  type MapeoColumnas,
  type ResultadoNormalizacion,
} from "@/lib/minimarket/carga-fiados-normalizador";

const EJEMPLO = `nombre,cedula,telefono,whatsapp,direccion,limite_fiado_usd,monto_adeudado,moneda,tasa,fecha_deuda,nota
"María Pérez",V12345678,04121234567,,"Calle Principal, Casa 12, Los Teques",50,35.50,USD,,,Productos varios de enero
"José Rodríguez",V87654321,,04141234567,,0,1200,Bs,bcv,2026-06-15,Fiado de mercado (cuaderno)
"Ana Gómez",,,,,100,0,USD,,,`;

const TEXTAREA_CLASS =
  "border-border bg-background focus-visible:ring-ring min-h-40 w-full rounded-md border p-3 font-mono text-xs focus-visible:outline-none focus-visible:ring-2";

const ESTADO_BADGE: Record<
  FilaPreviewFiado["estado"],
  { variant: "success" | "warning" | "danger"; texto: string }
> = {
  cliente_nuevo: { variant: "success", texto: "Cliente nuevo" },
  cliente_existente: { variant: "warning", texto: "Cliente existente" },
  error: { variant: "danger", texto: "Error" },
};

interface CargaFiadoClienteProps {
  /** Tasa vigente del negocio (tipo preferido en Configuración), solo lectura —
   * la usa el normalizador como último recurso para convertir filas en Bs sin
   * columna de tasa-tipo propia. `null` si el negocio nunca registró una tasa. */
  tasaNegocio: number | null;
}

export function CargaFiadoCliente({ tasaNegocio }: CargaFiadoClienteProps) {
  const router = useRouter();
  const [state, formAction] = useActionState<CargaFiadosResult, FormData>(cargaFiados, {});

  const [csv, setCsv] = React.useState("");
  const [nombreArchivo, setNombreArchivo] = React.useState<string | null>(null);
  const [errorArchivo, setErrorArchivo] = React.useState<string | null>(null);
  const [avanzadoAbierto, setAvanzadoAbierto] = React.useState(false);

  const [preview, setPreview] = React.useState<PreviewCargaFiadosResult | null>(null);
  const [errorPreview, setErrorPreview] = React.useState<string | null>(null);
  const [validando, startValidar] = React.useTransition();

  // Estado del paso de mapeo de columnas — solo se usa para archivos subidos
  // por el selector de archivo. El modo "Avanzado: pegar CSV" sigue exactamente
  // igual que siempre, sin pasar por ninguno de estos estados.
  const [filasCrudas, setFilasCrudas] = React.useState<unknown[][] | null>(null);
  const [indiceEncabezado, setIndiceEncabezado] = React.useState<number | null>(null);
  const [encabezadoAutomatico, setEncabezadoAutomatico] = React.useState(true);
  const [mapeo, setMapeo] = React.useState<MapeoColumnas | null>(null);
  const [consolidar, setConsolidar] = React.useState(false);
  const [mapeoConfirmado, setMapeoConfirmado] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  function reiniciarPreview() {
    setPreview(null);
    setErrorPreview(null);
  }

  function reiniciarMapeo() {
    setFilasCrudas(null);
    setIndiceEncabezado(null);
    setMapeo(null);
    setConsolidar(false);
    setMapeoConfirmado(false);
  }

  function actualizarCsv(nuevo: string, archivo: string | null) {
    setCsv(nuevo);
    setNombreArchivo(archivo);
    setErrorArchivo(null);
    reiniciarPreview();
    reiniciarMapeo();
  }

  async function manejarArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    try {
      const filas = await leerArchivoComoFilas(archivo);
      const { indice, automatica } = detectarFilaEncabezado(filas);
      const mapeoDetectado = detectarMapeoColumnas(filas[indice] ?? []);

      setFilasCrudas(filas);
      setIndiceEncabezado(indice);
      setEncabezadoAutomatico(automatica);
      setMapeo(mapeoDetectado);
      setConsolidar(false);
      setMapeoConfirmado(false);
      setNombreArchivo(archivo.name);
      setErrorArchivo(null);
      setCsv("");
      reiniciarPreview();
    } catch {
      setErrorArchivo(
        "No se pudo leer el archivo. Verifica que sea un .xlsx o .csv válido (usa la plantilla descargada).",
      );
    }
  }

  const filaEncabezadoActual: unknown[] =
    filasCrudas && indiceEncabezado != null ? (filasCrudas[indiceEncabezado] ?? []) : [];

  const tasaResumen = React.useMemo(() => {
    if (!filasCrudas || indiceEncabezado == null) return null;
    return extraerTasaDeResumen(filasCrudas, indiceEncabezado);
  }, [filasCrudas, indiceEncabezado]);

  const resultadoNormalizacion: ResultadoNormalizacion | null = React.useMemo(() => {
    if (!filasCrudas || indiceEncabezado == null || !mapeo) return null;
    return normalizarFilasFiado({
      filas: filasCrudas,
      indiceEncabezado,
      mapeo,
      consolidar,
      tasaResumen,
      tasaNegocio,
    });
  }, [filasCrudas, indiceEncabezado, mapeo, consolidar, tasaResumen, tasaNegocio]);

  function cambiarMapeoCampo(campo: CampoCanonico, valor: string) {
    setMapeo((actual) => {
      if (!actual) return actual;
      if (valor === "") {
        return { ...actual, [campo]: { indice: null, encabezadoOriginal: null } };
      }
      const indice = Number(valor);
      const encabezadoOriginal =
        filaEncabezadoActual[indice] == null ? "" : String(filaEncabezadoActual[indice]).trim();
      return { ...actual, [campo]: { indice, encabezadoOriginal } };
    });
  }

  function validar(csvOverride?: string) {
    const texto = csvOverride ?? csv;
    setErrorPreview(null);
    startValidar(async () => {
      const res = await previsualizarCargaFiados(texto);
      if (res.error) {
        setErrorPreview(res.error);
        setPreview(null);
        return;
      }
      setPreview(res);
    });
  }

  function usarMapeo() {
    if (!resultadoNormalizacion) return;
    const csvGenerado = filasACsvCanonico(resultadoNormalizacion.filas);
    setCsv(csvGenerado);
    setMapeoConfirmado(true);
    validar(csvGenerado);
  }

  function cancelarArchivo() {
    setNombreArchivo(null);
    setCsv("");
    reiniciarPreview();
    reiniciarMapeo();
  }

  const importables =
    (preview?.resumen?.clientesNuevos ?? 0) + (preview?.resumen?.clientesExistentes ?? 0);

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="text-accent-600 size-5" aria-hidden />
          <h2 className="text-heading font-medium">Cómo cargar tus fiados</h2>
        </div>
        <ol className="text-muted-foreground list-inside list-decimal space-y-1 text-sm">
          <li>
            <strong className="text-heading">Descarga la plantilla</strong> — trae las columnas
            exactas que el sistema necesita, con clientes de ejemplo ya llenos.
          </li>
          <li>
            <strong className="text-heading">Copia tus fiados</strong> desde tu cuaderno o Excel y
            pégalos en la plantilla (borra las filas de ejemplo).
          </li>
          <li>
            <strong className="text-heading">Súbela aquí</strong> y revisa la vista previa antes de
            confirmar.
          </li>
        </ol>
        <p className="text-muted-foreground text-xs">
          Si el cliente ya existe (misma cédula, o mismo nombre si no pusiste cédula), la deuda se
          suma a su cuenta — nunca se duplica el cliente. Un monto adeudado en{" "}
          <strong className="text-heading">Bs</strong> se convierte a USD (la moneda base del
          sistema) con la tasa que indiques.
        </p>
        <Button type="button" variant="outline" onClick={() => descargarPlantillaFiados()}>
          <Download className="size-4" aria-hidden />
          Descargar plantilla de ejemplo
        </Button>
      </Card>

      <Card className="space-y-3 p-5">
        <Label htmlFor="archivo-carga-fiados">Sube tu archivo (.xlsx o .csv)</Label>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="primary" onClick={() => fileInputRef.current?.click()}>
            <Upload className="size-4" aria-hidden />
            Elegir archivo
          </Button>
          <input
            ref={fileInputRef}
            id="archivo-carga-fiados"
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
                Una fila por fiado, separada por comas (la primera fila puede ser el encabezado).
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
            <Button type="button" onClick={() => validar()} disabled={validando}>
              {validando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Validar fiados
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

      {filasCrudas && indiceEncabezado != null && mapeo && resultadoNormalizacion ? (
        mapeoConfirmado ? (
          <div className="border-border bg-surface-2 flex flex-wrap items-center justify-between gap-2 rounded-md border px-4 py-3 text-sm">
            <span className="text-heading">
              Columnas mapeadas: {resultadoNormalizacion.filas.length} deuda(s) para{" "}
              {resultadoNormalizacion.clientesUnicosDetectados} cliente(s) detectado(s).
            </span>
            <button
              type="button"
              className="text-accent-600 text-xs font-medium underline-offset-2 hover:underline"
              onClick={() => setMapeoConfirmado(false)}
            >
              Editar mapeo
            </button>
          </div>
        ) : (
          <Card className="space-y-4 p-5">
            <div>
              <h2 className="text-heading font-medium">Revisar columnas detectadas</h2>
              <p className="text-muted-foreground text-sm">
                El archivo <strong className="text-heading">{nombreArchivo}</strong> no viene en el
                formato exacto de la plantilla — el sistema detectó estas columnas automáticamente.
                Ajusta lo que no coincida antes de importar.
              </p>
            </div>

            {!encabezadoAutomatico ? (
              <p className="bg-warning/10 text-warning rounded-md px-3 py-2.5 text-xs">
                No se pudo detectar automáticamente cuál fila es el encabezado — se usó la primera
                fila del archivo. Revisa que el mapeo de columnas de abajo sea correcto.
              </p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              {CAMPOS_CANONICOS.map((campo) => (
                <div key={campo} className="space-y-1.5">
                  <Label htmlFor={`mapeo-${campo}`}>{CAMPO_LABEL[campo]}</Label>
                  <select
                    id={`mapeo-${campo}`}
                    value={mapeo[campo].indice ?? ""}
                    onChange={(e) => cambiarMapeoCampo(campo, e.target.value)}
                    className="border-border bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2"
                  >
                    <option value="">— ninguna —</option>
                    {filaEncabezadoActual.map((h, i) => (
                      <option key={i} value={i}>
                        {`Columna ${i + 1}: ${h == null || String(h).trim() === "" ? "(vacía)" : String(h)}`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <span className="text-heading text-sm font-medium">
                Si un cliente se repite en varias filas
              </span>
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="modo-agrupacion"
                    checked={!consolidar}
                    onChange={() => setConsolidar(false)}
                  />
                  Importar cada fila como una deuda separada (recomendado)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="modo-agrupacion"
                    checked={consolidar}
                    onChange={() => setConsolidar(true)}
                  />
                  Consolidar en una sola deuda por cliente
                </label>
              </div>
            </div>

            <div className="border-border space-y-2 rounded-md border p-4">
              <p className="text-heading text-sm font-medium">
                Se detectaron {resultadoNormalizacion.filas.length} deuda(s) para{" "}
                {resultadoNormalizacion.clientesUnicosDetectados} cliente(s) — total estimado $
                {resultadoNormalizacion.totalUsdEstimado.toFixed(2)}.
              </p>
              {tasaResumen != null ? (
                <p className="text-muted-foreground text-xs">
                  Se detectó una tasa de {tasaResumen.toFixed(2)} Bs/$ en el propio archivo — se
                  usará para las filas en bolívares que no traigan su propia tasa.
                </p>
              ) : null}

              {resultadoNormalizacion.filas.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                      <tr>
                        <th className="px-2 py-1.5 font-medium">Cliente</th>
                        <th className="px-2 py-1.5 text-right font-medium">Monto</th>
                        <th className="px-2 py-1.5 font-medium">Fecha</th>
                        <th className="px-2 py-1.5 font-medium">Nota</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultadoNormalizacion.filas.slice(0, 10).map((f) => (
                        <tr key={f.filaOrigen} className="border-border/70 border-b last:border-0">
                          <td className="text-heading px-2 py-1.5">{f.nombre}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {f.moneda === "Bs"
                              ? `Bs ${f.monto.toFixed(2)}`
                              : `$${f.monto.toFixed(2)}`}
                          </td>
                          <td className="text-muted-foreground px-2 py-1.5">
                            {f.fechaDeuda || "—"}
                          </td>
                          <td className="text-muted-foreground px-2 py-1.5 text-xs">
                            {f.nota || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {resultadoNormalizacion.filas.length > 10 ? (
                    <p className="text-muted-foreground mt-1 text-xs">
                      Mostrando 10 de {resultadoNormalizacion.filas.length} deuda(s).
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {resultadoNormalizacion.advertencias.length > 0 ? (
              <div className="bg-warning/10 space-y-1 rounded-md px-3 py-2.5">
                <p className="text-warning text-xs font-medium">
                  {resultadoNormalizacion.advertencias.length} advertencia(s):
                </p>
                <ul className="text-warning list-inside list-disc space-y-0.5 text-xs">
                  {resultadoNormalizacion.advertencias.slice(0, 15).map((a, i) => (
                    <li key={i}>
                      Fila {a.fila}: {a.mensaje}
                    </li>
                  ))}
                </ul>
                {resultadoNormalizacion.advertencias.length > 15 ? (
                  <p className="text-warning text-xs">
                    y {resultadoNormalizacion.advertencias.length - 15} más…
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={cancelarArchivo}>
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={usarMapeo}
                disabled={validando || resultadoNormalizacion.filas.length === 0}
              >
                {validando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Usar este mapeo
              </Button>
            </div>
          </Card>
        )
      ) : null}

      {preview?.filas ? (
        <Card className="space-y-3 p-5">
          <h2 className="text-heading font-medium">Vista previa</h2>
          <p className="text-muted-foreground text-sm">
            Se importarán <strong className="text-heading">{importables}</strong> fiado(s) de{" "}
            {preview.resumen?.total ?? 0} fila(s), para{" "}
            <strong className="text-heading">{preview.resumen?.clientesNuevos ?? 0}</strong>{" "}
            cliente(s) nuevo(s) y {preview.resumen?.clientesExistentes ?? 0} existente(s).{" "}
            {preview.resumen && preview.resumen.errores > 0
              ? `${preview.resumen.errores} fila(s) con errores no se importarán.`
              : ""}
          </p>
          <p className="text-heading text-sm font-medium">
            Total adeudado a importar: ${(preview.resumen?.totalAdeudadoUsd ?? 0).toFixed(2)}
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-border text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2 font-medium">Fila</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Cédula</th>
                  <th className="px-3 py-2 text-right font-medium">Monto adeudado</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {preview.filas.map((f) => {
                  const badge = ESTADO_BADGE[f.estado];
                  return (
                    <tr key={f.linea} className="border-border/70 border-b last:border-0">
                      <td className="text-muted-foreground px-3 py-2 tabular-nums">{f.linea}</td>
                      <td className="text-heading px-3 py-2">{f.nombre || "—"}</td>
                      <td className="text-muted-foreground px-3 py-2">{f.cedula || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {f.estado === "error" ? (
                          "—"
                        ) : (
                          <>
                            ${f.monto_usd.toFixed(2)}
                            {f.moneda_original === "Bs" ? (
                              <span className="text-muted-foreground block text-xs">
                                (Bs {f.monto_original.toFixed(2)})
                              </span>
                            ) : null}
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={badge.variant}>{badge.texto}</Badge>
                      </td>
                      <td className="text-muted-foreground px-3 py-2 text-xs">{f.motivo ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <form action={formAction} className="space-y-3">
            <input type="hidden" name="csv" value={csv} />

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
                  Se crearon {state.clientesCreados ?? 0} cliente(s) nuevo(s), se usaron{" "}
                  {state.clientesReutilizados ?? 0} cliente(s) existente(s), y se registraron{" "}
                  {state.fiadosCreados ?? 0} deuda(s).
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
                  <Link href="/minimarket/fiado">Ver cuentas por cobrar</Link>
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
