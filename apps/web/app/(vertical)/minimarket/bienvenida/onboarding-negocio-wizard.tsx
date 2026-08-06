"use client";

import * as React from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  MapPin,
  Phone,
  Sparkles,
} from "lucide-react";
import { Button, Card, Label, cn } from "@arkiteq/ui";
import { BienvenidaOnboardingCompleto } from "@/components/bienvenida/bienvenida-onboarding-completo";
import { LogoUpload } from "../configuracion/logo-upload";
import {
  TIPOS_NEGOCIO,
  TIPO_NEGOCIO_VALUES,
  type TipoNegocio,
} from "@/lib/minimarket/tipos-negocio";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import {
  completarDatosNegocioInicialAction,
  guardarProgresoPaso1Action,
  subirLogoBienvenidaAction,
} from "./actions";

interface Props {
  nombreComercial: string;
  rif: string;
  direccion: string;
  telefono: string;
  logoUrl: string | null;
  /** Rubros ya elegidos (negocio mixto). Vacío = primera vez. */
  tiposNegocio: string[];
  /** Nombre de la persona (no del negocio) — solo para la bienvenida final. */
  nombreUsuario: string;
}

/** Campos del paso 1 que pueden marcarse con error individual. */
type CampoPaso1 = "nombre_comercial" | "numero_documento" | "telefono" | "direccion";

const LABEL = "text-muted-foreground block text-xs font-medium uppercase tracking-wide";
const INPUT =
  "border-border bg-background text-heading w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-offset-1 focus:ring-accent-400";
const INPUT_ERROR = "border-danger focus:ring-danger";

const TIPOS_DOCUMENTO = [
  { value: "V", label: "V — Venezolano" },
  { value: "E", label: "E — Extranjero" },
  { value: "J", label: "J — Jurídico (empresa)" },
  { value: "G", label: "G — Gubernamental" },
] as const;

/** Divide un RIF/cédula guardado ("V-12345678") en tipo de documento + número. */
function parseRif(rif: string): { tipoDocumento: string; numeroDocumento: string } {
  const match = /^([VEJGveJG])-?(\d{6,10})$/.exec(rif.trim());
  if (!match) return { tipoDocumento: "V", numeroDocumento: "" };
  return { tipoDocumento: match[1]?.toUpperCase() ?? "V", numeroDocumento: match[2] ?? "" };
}

export function OnboardingNegocioWizard({
  nombreComercial,
  rif,
  direccion,
  telefono,
  logoUrl,
  tiposNegocio,
  nombreUsuario,
}: Props) {
  const rifInicial = parseRif(rif);
  const reducedMotion = usePrefersReducedMotion();

  const [paso, setPaso] = React.useState<1 | 2>(1);
  const [nombre, setNombre] = React.useState(nombreComercial);
  const [tipoDocumento, setTipoDocumento] = React.useState(rifInicial.tipoDocumento);
  const [numeroDocumento, setNumeroDocumento] = React.useState(rifInicial.numeroDocumento);
  const [telefonoValor, setTelefonoValor] = React.useState(telefono);
  const [direccionValor, setDireccionValor] = React.useState(direccion);
  const [tiposSeleccionados, setTiposSeleccionados] = React.useState<TipoNegocio[]>(() =>
    tiposNegocio.filter((t): t is TipoNegocio => (TIPO_NEGOCIO_VALUES as string[]).includes(t)),
  );
  const [errorPaso1, setErrorPaso1] = React.useState<string | null>(null);
  const [camposConError, setCamposConError] = React.useState<Partial<Record<CampoPaso1, string>>>(
    {},
  );
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [completado, setCompletado] = React.useState(false);

  function alternarTipo(value: TipoNegocio) {
    setError(null);
    setTiposSeleccionados((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value],
    );
  }

  const nombreRef = React.useRef<HTMLInputElement>(null);
  const numeroDocumentoRef = React.useRef<HTMLInputElement>(null);
  const telefonoRef = React.useRef<HTMLInputElement>(null);
  const direccionRef = React.useRef<HTMLTextAreaElement>(null);
  const gridTipoRef = React.useRef<HTMLDivElement>(null);

  const refsPaso1: Record<CampoPaso1, React.RefObject<HTMLElement | null>> = {
    nombre_comercial: nombreRef,
    numero_documento: numeroDocumentoRef,
    telefono: telefonoRef,
    direccion: direccionRef,
  };
  // Orden en el que aparecen en el formulario — determina cuál es "el primer
  // error" cuando hay varios a la vez.
  const ordenCamposPaso1: CampoPaso1[] = [
    "nombre_comercial",
    "numero_documento",
    "telefono",
    "direccion",
  ];

  function llevarYEnfocar(ref: React.RefObject<HTMLElement | null>) {
    const el = ref.current;
    if (!el) return;
    el.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
    // `preventScroll` evita que el propio focus dispare un segundo salto
    // (el scroll suave de arriba ya se encarga de ubicarlo en pantalla).
    window.setTimeout(() => el.focus({ preventScroll: true }), reducedMotion ? 0 : 300);
  }

  async function irAPaso2(e: React.FormEvent) {
    e.preventDefault();
    setErrorPaso1(null);

    const errores: Partial<Record<CampoPaso1, string>> = {};
    if (!nombre.trim()) errores.nombre_comercial = "El nombre del negocio es obligatorio.";
    if (!/^\d{6,10}$/.test(numeroDocumento.trim())) {
      errores.numero_documento = "El número de documento debe tener entre 6 y 10 dígitos.";
    }
    if (telefonoValor.replace(/\D/g, "").length < 10) {
      errores.telefono = "Indica un teléfono/WhatsApp válido (con código de área).";
    }
    setCamposConError(errores);

    const primerCampo = ordenCamposPaso1.find((c) => errores[c]);
    if (primerCampo) {
      llevarYEnfocar(refsPaso1[primerCampo]);
      return;
    }

    // Guarda el paso 1 YA en el servidor (no solo en el estado de este
    // componente): si el usuario no llega a elegir el rubro en el paso 2 y
    // cierra la pestaña, estos datos no se pierden — vuelven prellenados la
    // próxima vez que entre a este asistente.
    setPending(true);
    const fd = new FormData();
    fd.set("nombre_comercial", nombre);
    fd.set("tipo_documento", tipoDocumento);
    fd.set("numero_documento", numeroDocumento);
    fd.set("telefono", telefonoValor);
    fd.set("direccion", direccionValor);
    const res = await guardarProgresoPaso1Action({}, fd);
    setPending(false);

    if (!res.ok) {
      const fieldErrors = (res.fieldErrors ?? {}) as Partial<Record<CampoPaso1, string>>;
      setCamposConError(fieldErrors);
      const primerCampoServidor = ordenCamposPaso1.find((c) => fieldErrors[c]);
      if (primerCampoServidor) {
        llevarYEnfocar(refsPaso1[primerCampoServidor]);
      } else {
        setErrorPaso1(res.error ?? "No se pudieron guardar los datos.");
      }
      return;
    }
    setPaso(2);
  }

  async function finalizar() {
    if (tiposSeleccionados.length === 0) {
      setError("Elige al menos un tipo de negocio para continuar.");
      llevarYEnfocar(gridTipoRef);
      return;
    }
    setError(null);
    setPending(true);

    const fd = new FormData();
    fd.set("nombre_comercial", nombre);
    fd.set("tipo_documento", tipoDocumento);
    fd.set("numero_documento", numeroDocumento);
    fd.set("telefono", telefonoValor);
    fd.set("direccion", direccionValor);
    // Negocio mixto: se envía un `tipo_negocio` por cada rubro elegido.
    for (const t of tiposSeleccionados) fd.append("tipo_negocio", t);

    const res = await completarDatosNegocioInicialAction({}, fd);
    setPending(false);

    if (!res.ok) {
      setError(
        res.error ?? Object.values(res.fieldErrors ?? {})[0] ?? "No se pudieron guardar los datos.",
      );
      llevarYEnfocar(gridTipoRef);
      return;
    }

    // No se navega con el router de Next aquí (ver `BienvenidaOnboardingCompleto`):
    // esta misma ruta le respondía al layout con un `redirect()` al asistente
    // hasta hace un instante, y una navegación blanda podía quedarse con esa
    // respuesta vieja del Router Cache — de ahí la pantalla en negro que
    // obligaba a recargar. La pantalla de bienvenida final resuelve el acceso
    // al escritorio con una navegación dura.
    setCompletado(true);
  }

  if (completado) {
    return (
      <BienvenidaOnboardingCompleto
        nombreUsuario={nombreUsuario}
        nombreNegocio={nombre.trim() || "tu negocio"}
        destino="/minimarket"
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2 text-center">
        <span className="bg-accent-500/10 text-accent-600 mx-auto inline-flex size-14 items-center justify-center rounded-2xl">
          <Sparkles className="size-7" aria-hidden />
        </span>
        <h1 className="font-display text-heading text-2xl font-semibold sm:text-3xl">
          ¡Bienvenido a tu Minimarket!
        </h1>
        <p className="text-muted-foreground mx-auto max-w-md text-sm">
          Cuéntanos de tu negocio para dejarte todo listo — incluidas las categorías de inventario
          de tu rubro.
        </p>
      </header>

      <div className="flex items-center justify-center gap-2" aria-hidden>
        {[1, 2].map((n) => (
          <div key={n} className="flex items-center gap-2">
            <span
              className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                paso >= n ? "bg-accent-500 text-white" : "bg-surface-2 text-muted-foreground"
              }`}
            >
              {paso > n ? <Check className="size-3.5" /> : n}
            </span>
            {n === 1 ? (
              <span
                className={`h-0.5 w-10 rounded-full transition-colors ${paso > 1 ? "bg-accent-500" : "bg-surface-2"}`}
              />
            ) : null}
          </div>
        ))}
      </div>

      {paso === 1 ? (
        <Card className="space-y-5 p-6">
          <div>
            <h2 className="text-heading text-lg font-semibold">Datos de tu negocio</h2>
            <p className="text-muted-foreground text-sm">Paso 1 de 2</p>
          </div>

          {errorPaso1 ? (
            <p
              role="alert"
              className="bg-danger/10 text-danger flex items-center gap-2 rounded-md px-3 py-2.5 text-sm"
            >
              <AlertCircle className="size-4 shrink-0" aria-hidden />
              {errorPaso1}
            </p>
          ) : null}

          <form onSubmit={irAPaso2} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="ob-nombre">
                Nombre del negocio <span className="text-danger">*</span>
              </Label>
              <div className="relative">
                <Building2
                  className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
                  aria-hidden
                />
                <input
                  id="ob-nombre"
                  ref={nombreRef}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="ej. Minimarket El Palmar"
                  maxLength={160}
                  required
                  aria-invalid={Boolean(camposConError.nombre_comercial)}
                  aria-describedby={camposConError.nombre_comercial ? "ob-nombre-error" : undefined}
                  className={cn(INPUT, "pl-9", camposConError.nombre_comercial && INPUT_ERROR)}
                />
              </div>
              {camposConError.nombre_comercial ? (
                <p id="ob-nombre-error" role="alert" className="text-danger text-xs">
                  {camposConError.nombre_comercial}
                </p>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
              <div className="space-y-1.5">
                <Label htmlFor="ob-tipo-doc">Documento</Label>
                <select
                  id="ob-tipo-doc"
                  value={tipoDocumento}
                  onChange={(e) => setTipoDocumento(e.target.value)}
                  className={`${INPUT} sm:w-44`}
                >
                  {TIPOS_DOCUMENTO.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-numero-doc">
                  Número <span className="text-danger">*</span>
                </Label>
                <input
                  id="ob-numero-doc"
                  ref={numeroDocumentoRef}
                  inputMode="numeric"
                  value={numeroDocumento}
                  onChange={(e) =>
                    setNumeroDocumento(e.target.value.replace(/\D/g, "").slice(0, 10))
                  }
                  placeholder="12345678"
                  required
                  aria-invalid={Boolean(camposConError.numero_documento)}
                  aria-describedby={
                    camposConError.numero_documento ? "ob-numero-doc-error" : undefined
                  }
                  className={cn(INPUT, camposConError.numero_documento && INPUT_ERROR)}
                />
                {camposConError.numero_documento ? (
                  <p id="ob-numero-doc-error" role="alert" className="text-danger text-xs">
                    {camposConError.numero_documento}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ob-telefono">
                Teléfono / WhatsApp <span className="text-danger">*</span>
              </Label>
              <div className="relative">
                <Phone
                  className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
                  aria-hidden
                />
                <input
                  id="ob-telefono"
                  ref={telefonoRef}
                  type="tel"
                  value={telefonoValor}
                  onChange={(e) => setTelefonoValor(e.target.value)}
                  placeholder="0412-1234567"
                  required
                  aria-invalid={Boolean(camposConError.telefono)}
                  aria-describedby={camposConError.telefono ? "ob-telefono-error" : undefined}
                  className={cn(INPUT, "pl-9", camposConError.telefono && INPUT_ERROR)}
                />
              </div>
              {camposConError.telefono ? (
                <p id="ob-telefono-error" role="alert" className="text-danger text-xs">
                  {camposConError.telefono}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ob-direccion">Dirección</Label>
              <div className="relative">
                <MapPin
                  className="text-muted-foreground pointer-events-none absolute left-3 top-3 size-4"
                  aria-hidden
                />
                <textarea
                  id="ob-direccion"
                  ref={direccionRef}
                  value={direccionValor}
                  onChange={(e) => setDireccionValor(e.target.value)}
                  rows={2}
                  maxLength={400}
                  placeholder="Dirección del negocio principal"
                  aria-invalid={Boolean(camposConError.direccion)}
                  aria-describedby={camposConError.direccion ? "ob-direccion-error" : undefined}
                  className={cn(INPUT, "resize-none pl-9", camposConError.direccion && INPUT_ERROR)}
                />
              </div>
              {camposConError.direccion ? (
                <p id="ob-direccion-error" role="alert" className="text-danger text-xs">
                  {camposConError.direccion}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <p className={LABEL}>Logo (opcional)</p>
              <LogoUpload logoUrl={logoUrl} action={subirLogoBienvenidaAction} />
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? "Guardando…" : "Continuar"}
                {!pending ? <ArrowRight className="size-4" /> : null}
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <Card className="space-y-5 p-6">
          <div>
            <h2 className="text-heading text-lg font-semibold">¿Cuál es el rubro de tu negocio?</h2>
            <p className="text-muted-foreground text-sm">
              Paso 2 de 2 · Elige uno o varios (tu negocio puede ser mixto) y te dejamos las
              categorías de inventario típicas de esos rubros ya creadas.
            </p>
          </div>

          {error ? (
            <p
              role="alert"
              className="bg-danger/10 text-danger flex items-center gap-2 rounded-md px-3 py-2.5 text-sm"
            >
              <AlertCircle className="size-4 shrink-0" aria-hidden />
              {error}
            </p>
          ) : null}

          <div
            ref={gridTipoRef}
            tabIndex={-1}
            aria-invalid={Boolean(error)}
            className={cn(
              "grid gap-3 rounded-xl sm:grid-cols-2",
              error && "ring-danger ring-2 ring-offset-2",
            )}
          >
            {TIPOS_NEGOCIO.map((opcion) => {
              const activo = tiposSeleccionados.includes(opcion.value);
              const visibles = opcion.categorias.slice(0, 6);
              const restantes = opcion.categorias.length - visibles.length;
              return (
                <button
                  key={opcion.value}
                  type="button"
                  onClick={() => alternarTipo(opcion.value)}
                  aria-pressed={activo}
                  className={`flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors ${
                    activo
                      ? "border-accent-500 bg-accent-500/5 ring-accent-500/30 ring-2"
                      : "border-border bg-background hover:bg-surface-2"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-heading text-sm font-semibold">{opcion.label}</p>
                    {activo ? (
                      <span className="bg-accent-500 flex size-5 shrink-0 items-center justify-center rounded-full text-white">
                        <Check className="size-3.5" />
                      </span>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground text-xs">{opcion.descripcion}</p>
                  {opcion.categorias.length > 0 ? (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {visibles.map((c) => (
                        <span
                          key={c}
                          className="bg-surface-2 text-muted-foreground rounded-full px-2 py-0.5 text-[11px]"
                        >
                          {c}
                        </span>
                      ))}
                      {restantes > 0 ? (
                        <span className="text-muted-foreground px-1 py-0.5 text-[11px] font-medium">
                          +{restantes} más
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-muted-foreground pt-1 text-[11px] italic">
                      Sin categorías precargadas — las creas tú.
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          <p className="text-muted-foreground text-center text-xs" aria-live="polite">
            {tiposSeleccionados.length === 0
              ? "Puedes elegir varios rubros si tu negocio es mixto."
              : `${tiposSeleccionados.length} rubro${tiposSeleccionados.length !== 1 ? "s" : ""} seleccionado${tiposSeleccionados.length !== 1 ? "s" : ""}.`}
          </p>

          <div className="flex items-center justify-between pt-2">
            <Button type="button" variant="outline" onClick={() => setPaso(1)} disabled={pending}>
              <ArrowLeft className="size-4" />
              Atrás
            </Button>
            <Button
              type="button"
              size="lg"
              onClick={finalizar}
              disabled={pending || tiposSeleccionados.length === 0}
            >
              {pending ? "Creando tu negocio…" : "Finalizar y crear mi negocio"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
