"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { requirePermisoAccion } from "@/lib/minimarket/permisos";
import { getTasaParaFecha } from "@/lib/minimarket/exchange-rate";
import { getMontoNativoRegistrado } from "@/lib/minimarket/monto-nativo";
import { esEfectivo } from "@/lib/minimarket/pos-calc";
import {
  esMetodoConCuenta,
  monedaNativaCuenta,
  monedaNativaMetodoPago,
  type MetodoConCuenta,
} from "@/lib/minimarket/bancos";
import { METODOS_GASTO_IDS } from "@/lib/minimarket/constants";
import {
  getImpactoCajaGasto,
  getSesionAbierta,
  insertarMovimientoCaja,
} from "@/lib/minimarket/data/caja";
import { getSucursalActiva } from "@/lib/minimarket/sucursal-acceso";
import {
  getImpactoCuentaPorReferencia,
  insertarMovimientoCuenta,
} from "@/lib/minimarket/data/bancos";
import type { MmMetodoPago } from "@arkiteq/db";

const GASTOS_PATH = "/minimarket/reportes/gastos";
const GANANCIAS_PATH = "/minimarket/reportes/ganancias";
const CAJA_PATH = "/minimarket/caja";
const BANCOS_PATH = "/minimarket/bancos";
const redondear = (n: number) => Math.round(n * 100) / 100;

export interface GastoResult {
  ok?: boolean;
  gastoId?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(error.issues.map((i) => [i.path[0], i.message]));
}

function toNull(v: string | undefined): string | null {
  return v && v.length > 0 ? v : null;
}

async function contexto() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id ?? null;
  if (!session || !tenantId) return null;
  const supabase = await createClient();
  return { supabase, tenantId, userId: session.user.id };
}

const gastoSchema = z.object({
  descripcion: z.string().trim().min(1, "La descripción es obligatoria.").max(160),
  categoria_id: z.string().uuid({ message: "Selecciona una categoría." }),
  monto: z.coerce
    .number({ invalid_type_error: "Monto inválido." })
    .positive("El monto debe ser mayor a cero."),
  fecha: z.string().min(1, "La fecha es obligatoria."),
  notas: z.string().trim().max(1000).optional().or(z.literal("")),
  metodo_pago: z.enum(METODOS_GASTO_IDS, {
    errorMap: () => ({ message: "Selecciona de dónde salió el dinero." }),
  }),
  /** Solo cuando metodo_pago es digital — de qué cuenta bancaria sale el dinero. */
  cuenta_bancaria_id: z.string().uuid().optional().or(z.literal("")),
});

/** Tasa a congelar para este gasto (histórica si `fecha` es pasada) y monto
 * canónico en USD para `mm_gastos_operativos.monto_usd` — mismo criterio que
 * `resolverTasaYMontoUsd` en otros-ingresos/actions.ts. */
async function resolverTasaYMontoUsd(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  metodo: MmMetodoPago,
  montoNativo: number,
  fecha: string,
): Promise<{ montoUsd: number; tasa: number | null } | { error: string }> {
  const monedaNativa = monedaNativaMetodoPago(metodo);
  if (monedaNativa === "USD") return { montoUsd: montoNativo, tasa: null };
  const tasa = await getTasaParaFecha(supabase, tenantId, fecha);
  if (!tasa || tasa.valor <= 0) {
    return { error: "No hay tasa de cambio registrada; no se puede registrar el egreso." };
  }
  return { montoUsd: redondear(montoNativo / tasa.valor), tasa: tasa.valor };
}

/**
 * Valida y resuelve la cuenta bancaria de un gasto digital: debe existir,
 * pertenecer al tenant y coincidir con el método elegido — mismo criterio de
 * validación que ya usa Ventas (`ventas/actions.ts`, `cuentaValidaParaPago`).
 * A diferencia de Ventas (que ignora en silencio una cuenta inválida), aquí
 * SIEMPRE se bloquea: un gasto real no puede quedar sin su cuenta, mismo
 * criterio que ya aplica hoy a un gasto en efectivo sin caja abierta.
 */
async function resolverCuentaGasto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  metodo: MmMetodoPago,
  cuentaBancariaId: string | undefined,
): Promise<{ cuentaId: string } | { error: string }> {
  if (!cuentaBancariaId) {
    return { error: "Selecciona la cuenta bancaria de la que salió el dinero." };
  }
  const { data: cuenta } = await supabase
    .from("mm_cuentas_bancarias")
    .select("id, metodo")
    .eq("tenant_id", tenantId)
    .eq("id", cuentaBancariaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!cuenta || cuenta.metodo !== metodo) {
    return { error: "La cuenta bancaria elegida no es válida para este método." };
  }
  return { cuentaId: cuenta.id };
}

/**
 * Monto en USD y Bs que debe salir de la CUENTA BANCARIA por un gasto
 * digital: la columna de la moneda NATIVA de esa cuenta guarda el monto
 * tecleado EXACTO; la otra es solo referencia con la tasa congelada de la
 * fecha del gasto — mismo criterio que `registrarMovimientoCuentaManual`
 * (bancos/actions.ts) y `montoCuentaParaIngreso` (otros-ingresos/actions.ts).
 */
async function montoCuentaParaGasto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  metodo: MetodoConCuenta,
  montoNativo: number,
  fecha: string,
): Promise<{ montoUsd: number; montoBs: number; tasa: number } | { error: string }> {
  const tasa = await getTasaParaFecha(supabase, tenantId, fecha);
  if (!tasa || tasa.valor <= 0) {
    return { error: "No hay tasa de cambio registrada; no se puede registrar el egreso." };
  }
  const monedaNativa = monedaNativaCuenta(metodo);
  const montoUsd = monedaNativa === "USD" ? montoNativo : redondear(montoNativo / tasa.valor);
  const montoBs = monedaNativa === "VES" ? montoNativo : redondear(montoNativo * tasa.valor);
  return { montoUsd, montoBs, tasa: tasa.valor };
}

/**
 * Monto y moneda que debe salir de la CAJA física por un gasto en efectivo:
 * el monto tecleado, EXACTO, en la moneda nativa del método (USD para
 * efectivo_usd, Bs para efectivo_bs) — sin convertir ni reconvertir con la
 * tasa (CLAUDE.md punto 6).
 */
function montoCajaParaGasto(
  metodo: MmMetodoPago,
  montoNativo: number,
): { monto: number; moneda: "USD" | "VES" } {
  return { monto: montoNativo, moneda: monedaNativaMetodoPago(metodo) };
}

export async function crearGastoOperativo(
  _prev: GastoResult,
  formData: FormData,
): Promise<GastoResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "reportes",
    "crear",
  );
  if (permisoError) return { error: permisoError };

  const parsed = gastoSchema.safeParse({
    descripcion: formData.get("descripcion"),
    categoria_id: formData.get("categoria_id"),
    monto: formData.get("monto"),
    fecha: formData.get("fecha"),
    notas: formData.get("notas") ?? "",
    metodo_pago: formData.get("metodo_pago"),
    cuenta_bancaria_id: formData.get("cuenta_bancaria_id") ?? "",
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error), error: parsed.error.issues[0]?.message };
  }
  const d = parsed.data;
  const montoNativo = redondear(d.monto);

  const { count: categoriaValida } = await ctx.supabase
    .from("mm_categorias_movimiento")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", d.categoria_id)
    .eq("tipo", "gasto")
    .is("deleted_at", null);
  if (!categoriaValida) {
    return {
      error: "Selecciona una categoría válida.",
      fieldErrors: { categoria_id: "Selecciona una categoría válida." },
    };
  }

  const canonico = await resolverTasaYMontoUsd(
    ctx.supabase,
    ctx.tenantId,
    d.metodo_pago,
    montoNativo,
    d.fecha,
  );
  if ("error" in canonico) return { error: canonico.error, fieldErrors: { monto: canonico.error } };
  const montoUsd = canonico.montoUsd;

  // Un gasto en efectivo SIEMPRE debe poder descontar la caja — si no hay
  // sesión abierta, se bloquea la creación completa en vez de dejar un gasto
  // "en efectivo" que nunca tocó la gaveta (CLAUDE.md regla crítica #1).
  let sesionId: string | null = null;
  let montoCaja: { monto: number; moneda: "USD" | "VES" } | null = null;
  let cuentaId: string | null = null;
  let montoCuenta: { montoUsd: number; montoBs: number; tasa: number } | null = null;
  if (esEfectivo(d.metodo_pago)) {
    const { activa: sucursalActiva } = await getSucursalActiva(
      ctx.supabase,
      ctx.tenantId,
      ctx.userId,
    );
    if (!sucursalActiva) {
      return {
        error: "No tienes ninguna sucursal asignada.",
        fieldErrors: { metodo_pago: "Requiere sucursal asignada." },
      };
    }
    const sesion = await getSesionAbierta(ctx.supabase, ctx.tenantId, sucursalActiva.id);
    if (!sesion) {
      return {
        error: "Debes tener la caja abierta para registrar un gasto en efectivo.",
        fieldErrors: { metodo_pago: "Requiere caja abierta." },
      };
    }
    sesionId = sesion.id;
    montoCaja = montoCajaParaGasto(d.metodo_pago, montoNativo);
  } else if (esMetodoConCuenta(d.metodo_pago)) {
    // Mismo criterio que el efectivo sin caja abierta: un gasto digital SIN
    // cuenta bancaria válida se bloquea por completo, nunca queda "para
    // control" sin descontar ningún saldo (CLAUDE.md regla crítica #1).
    const cuentaRes = await resolverCuentaGasto(
      ctx.supabase,
      ctx.tenantId,
      d.metodo_pago,
      d.cuenta_bancaria_id,
    );
    if ("error" in cuentaRes) {
      return { error: cuentaRes.error, fieldErrors: { cuenta_bancaria_id: cuentaRes.error } };
    }
    const montoRes = await montoCuentaParaGasto(
      ctx.supabase,
      ctx.tenantId,
      d.metodo_pago,
      montoNativo,
      d.fecha,
    );
    if ("error" in montoRes)
      return { error: montoRes.error, fieldErrors: { metodo_pago: montoRes.error } };
    cuentaId = cuentaRes.cuentaId;
    montoCuenta = montoRes;
  }

  const { data: gasto, error } = await ctx.supabase
    .from("mm_gastos_operativos")
    .insert({
      tenant_id: ctx.tenantId,
      descripcion: d.descripcion,
      categoria_id: d.categoria_id,
      monto_usd: montoUsd,
      fecha: d.fecha,
      notas: toNull(d.notas),
      metodo_pago: d.metodo_pago,
      cuenta_bancaria_id: cuentaId,
      usuario_id: ctx.userId,
    })
    .select("id")
    .single();

  if (error || !gasto) return { error: "No se pudo registrar el gasto. Inténtalo de nuevo." };

  if (sesionId && montoCaja) {
    const { error: errorCaja } = await insertarMovimientoCaja(ctx.supabase, {
      tenantId: ctx.tenantId,
      sesionId,
      tipo: "egreso",
      monto: montoCaja.monto,
      moneda: montoCaja.moneda,
      motivo: `Gasto: ${d.descripcion}`,
      referencia: gasto.id,
      usuarioId: ctx.userId,
    });
    if (errorCaja) {
      // El egreso de caja es obligatorio para un gasto en efectivo — si falla,
      // se revierte el gasto para no dejarlo "flotando" sin su contraparte en
      // caja (nunca debe quedar un gasto en efectivo que no se refleje ahí).
      await ctx.supabase.from("mm_gastos_operativos").delete().eq("id", gasto.id);
      return { error: "No se pudo registrar el egreso en caja. El gasto no se guardó." };
    }
    revalidatePath(CAJA_PATH);
  }

  if (cuentaId && montoCuenta) {
    const { error: errorCuenta } = await insertarMovimientoCuenta(ctx.supabase, {
      tenantId: ctx.tenantId,
      cuentaId,
      tipo: "egreso",
      montoUsd: montoCuenta.montoUsd,
      montoBs: montoCuenta.montoBs,
      tasaUsada: montoCuenta.tasa,
      motivo: `Gasto: ${d.descripcion}`,
      referencia: gasto.id,
      usuarioId: ctx.userId,
    });
    if (errorCuenta) {
      // Mismo criterio que el egreso de caja: si falla, se revierte el gasto
      // para no dejarlo sin su contraparte en la cuenta bancaria.
      await ctx.supabase.from("mm_gastos_operativos").delete().eq("id", gasto.id);
      return {
        error: "No se pudo registrar el egreso en la cuenta bancaria. El gasto no se guardó.",
      };
    }
    revalidatePath(BANCOS_PATH);
  }

  revalidatePath(GASTOS_PATH);
  revalidatePath(GANANCIAS_PATH);
  return { ok: true, gastoId: gasto.id };
}

export async function actualizarGastoOperativo(
  gastoId: string,
  _prev: GastoResult,
  formData: FormData,
): Promise<GastoResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "reportes",
    "editar",
  );
  if (permisoError) return { error: permisoError };

  const parsed = gastoSchema.safeParse({
    descripcion: formData.get("descripcion"),
    categoria_id: formData.get("categoria_id"),
    monto: formData.get("monto"),
    fecha: formData.get("fecha"),
    notas: formData.get("notas") ?? "",
    metodo_pago: formData.get("metodo_pago"),
    cuenta_bancaria_id: formData.get("cuenta_bancaria_id") ?? "",
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error), error: parsed.error.issues[0]?.message };
  }
  const d = parsed.data;
  const montoNativo = redondear(d.monto);

  const { count: categoriaValida } = await ctx.supabase
    .from("mm_categorias_movimiento")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", d.categoria_id)
    .eq("tipo", "gasto")
    .is("deleted_at", null);
  if (!categoriaValida) {
    return {
      error: "Selecciona una categoría válida.",
      fieldErrors: { categoria_id: "Selecciona una categoría válida." },
    };
  }

  const { data: actual } = await ctx.supabase
    .from("mm_gastos_operativos")
    .select("monto_usd, metodo_pago, cuenta_bancaria_id, fecha")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", gastoId)
    .maybeSingle();
  if (!actual) return { error: "Gasto no encontrado." };

  const impacto = await getImpactoCajaGasto(ctx.supabase, ctx.tenantId, gastoId);
  const impactoCuenta = await getImpactoCuentaPorReferencia(ctx.supabase, ctx.tenantId, gastoId);

  // Bloqueado: reutiliza el monto_usd YA guardado tal cual, sin reconvertir
  // desde el monto nativo tecleado — evita que un redondeo de ida y vuelta
  // dispare un falso "cambió el monto" (CLAUDE.md punto 6).
  const bloqueadoServer = Boolean(impacto.sesionId) && !impacto.sesionAbierta;
  let montoUsd: number;
  // Mismo método y mismo monto nativo que ya refleja el ledger: el monto NO
  // cambió — se conserva el monto_usd guardado, sin reconvertir con otra tasa
  // (reconvertir daría un falso "cambió el monto" y reemitiría el movimiento
  // de caja/banco con un valor distinto al que se colocó).
  const montoNativoActual =
    actual.metodo_pago === d.metodo_pago
      ? await getMontoNativoRegistrado(
          ctx.supabase,
          ctx.tenantId,
          { ...actual, metodo_pago: d.metodo_pago },
          impacto.neto,
          impactoCuenta,
        )
      : null;
  const mismoMonto =
    montoNativoActual !== null && Math.abs(montoNativoActual - montoNativo) <= 0.001;
  if (bloqueadoServer || mismoMonto) {
    montoUsd = Number(actual.monto_usd);
  } else {
    const canonico = await resolverTasaYMontoUsd(
      ctx.supabase,
      ctx.tenantId,
      d.metodo_pago,
      montoNativo,
      d.fecha,
    );
    if ("error" in canonico)
      return { error: canonico.error, fieldErrors: { monto: canonico.error } };
    montoUsd = canonico.montoUsd;
  }

  const cambioMontoOMetodo =
    Math.abs(Number(actual.monto_usd) - montoUsd) > 0.001 || actual.metodo_pago !== d.metodo_pago;
  // Cambiar SOLO la cuenta (mismo monto, mismo método digital) también debe
  // mover el dinero de una cuenta a otra — no alcanza con mirar monto/método.
  const cambioCuenta =
    esMetodoConCuenta(d.metodo_pago) &&
    (actual.cuenta_bancaria_id ?? "") !== (d.cuenta_bancaria_id ?? "");
  const requiereActualizarBanco = cambioMontoOMetodo || cambioCuenta;

  // El monto/método de un gasto que ya generó un egreso de caja solo se
  // puede corregir mientras esa sesión SIGA ABIERTA — tocar una sesión ya
  // cerrada y arqueada rompería un cierre que el usuario ya validó (CLAUDE.md
  // regla crítica #1). Descripción/categoría/fecha/notas siempre son editables.
  // Bancos NO tiene este bloqueo (no existe "cierre" de una cuenta bancaria).
  if (cambioMontoOMetodo && bloqueadoServer) {
    return {
      error:
        "Este gasto ya pasó por un cierre de caja: el monto y el método de pago no se pueden " +
        "modificar. Solo puedes corregir la descripción, categoría, fecha o notas.",
      fieldErrors: {
        monto: "Bloqueado: caja ya cerrada.",
        metodo_pago: "Bloqueado: caja ya cerrada.",
      },
    };
  }

  let sesionIdNueva: string | null = null;
  let montoCajaNuevo: { monto: number; moneda: "USD" | "VES" } | null = null;
  if (cambioMontoOMetodo && esEfectivo(d.metodo_pago)) {
    // Sesión a usar: la misma donde ya vive este gasto si sigue abierta, o la
    // sesión abierta actual si el gasto nunca había tocado caja.
    let sesion: { id: string } | null = impacto.sesionId ? { id: impacto.sesionId } : null;
    if (!sesion) {
      const { activa: sucursalActiva } = await getSucursalActiva(
        ctx.supabase,
        ctx.tenantId,
        ctx.userId,
      );
      sesion = sucursalActiva
        ? await getSesionAbierta(ctx.supabase, ctx.tenantId, sucursalActiva.id)
        : null;
    }
    if (!sesion) {
      return {
        error: "Debes tener la caja abierta para que este gasto en efectivo quede reflejado.",
        fieldErrors: { metodo_pago: "Requiere caja abierta." },
      };
    }
    sesionIdNueva = sesion.id;
    montoCajaNuevo = montoCajaParaGasto(d.metodo_pago, montoNativo);
  }

  let cuentaIdNueva: string | null = null;
  let montoCuentaNuevo: { montoUsd: number; montoBs: number; tasa: number } | null = null;
  if (requiereActualizarBanco && esMetodoConCuenta(d.metodo_pago)) {
    const cuentaRes = await resolverCuentaGasto(
      ctx.supabase,
      ctx.tenantId,
      d.metodo_pago,
      d.cuenta_bancaria_id,
    );
    if ("error" in cuentaRes) {
      return { error: cuentaRes.error, fieldErrors: { cuenta_bancaria_id: cuentaRes.error } };
    }
    const montoRes = await montoCuentaParaGasto(
      ctx.supabase,
      ctx.tenantId,
      d.metodo_pago,
      montoNativo,
      d.fecha,
    );
    if ("error" in montoRes)
      return { error: montoRes.error, fieldErrors: { monto: montoRes.error } };
    cuentaIdNueva = cuentaRes.cuentaId;
    montoCuentaNuevo = montoRes;
  }

  const { error } = await ctx.supabase
    .from("mm_gastos_operativos")
    .update({
      descripcion: d.descripcion,
      categoria_id: d.categoria_id,
      monto_usd: montoUsd,
      fecha: d.fecha,
      notas: toNull(d.notas),
      metodo_pago: d.metodo_pago,
      cuenta_bancaria_id: requiereActualizarBanco
        ? cuentaIdNueva
        : (actual.cuenta_bancaria_id ?? null),
    })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", gastoId);

  if (error) return { error: "No se pudo actualizar el gasto." };

  if (cambioMontoOMetodo) {
    // Reversa completa de lo que este gasto tenía reflejado en caja (si
    // tenía) y, si el nuevo método sigue siendo efectivo, un nuevo egreso por
    // el monto actualizado — nunca se edita/borra el movimiento original
    // (ledger append-only, mismo criterio documentado en caja.ts).
    for (const n of impacto.neto) {
      await insertarMovimientoCaja(ctx.supabase, {
        tenantId: ctx.tenantId,
        sesionId: impacto.sesionId as string,
        tipo: "ingreso",
        monto: n.monto,
        moneda: n.moneda,
        motivo: `Ajuste gasto: ${d.descripcion}`,
        referencia: gastoId,
        usuarioId: ctx.userId,
      });
    }
    if (sesionIdNueva && montoCajaNuevo) {
      await insertarMovimientoCaja(ctx.supabase, {
        tenantId: ctx.tenantId,
        sesionId: sesionIdNueva,
        tipo: "egreso",
        monto: montoCajaNuevo.monto,
        moneda: montoCajaNuevo.moneda,
        motivo: `Gasto: ${d.descripcion}`,
        referencia: gastoId,
        usuarioId: ctx.userId,
      });
    }
    revalidatePath(CAJA_PATH);
  }

  if (requiereActualizarBanco) {
    // Mismo criterio que caja: revierte el neto que este gasto tenía
    // reflejado en su(s) cuenta(s) anterior(es) y, si el método sigue/pasa a
    // ser digital, emite el nuevo egreso en la cuenta elegida — ledger
    // append-only, nunca se edita el movimiento original.
    for (const n of impactoCuenta) {
      await insertarMovimientoCuenta(ctx.supabase, {
        tenantId: ctx.tenantId,
        cuentaId: n.cuentaId,
        tipo: n.netoUsd >= 0 ? "ingreso" : "egreso",
        montoUsd: Math.abs(n.netoUsd),
        montoBs: Math.abs(n.netoBs),
        motivo: `Ajuste gasto: ${d.descripcion}`,
        referencia: gastoId,
        usuarioId: ctx.userId,
      });
    }
    if (cuentaIdNueva && montoCuentaNuevo) {
      await insertarMovimientoCuenta(ctx.supabase, {
        tenantId: ctx.tenantId,
        cuentaId: cuentaIdNueva,
        tipo: "egreso",
        montoUsd: montoCuentaNuevo.montoUsd,
        montoBs: montoCuentaNuevo.montoBs,
        tasaUsada: montoCuentaNuevo.tasa,
        motivo: `Gasto: ${d.descripcion}`,
        referencia: gastoId,
        usuarioId: ctx.userId,
      });
    }
    revalidatePath(BANCOS_PATH);
  }

  revalidatePath(GASTOS_PATH);
  revalidatePath(GANANCIAS_PATH);
  return { ok: true, gastoId };
}

export async function eliminarGastoOperativo(formData: FormData): Promise<GastoResult> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sesión no válida." };
  const permisoError = await requirePermisoAccion(
    ctx.supabase,
    ctx.tenantId,
    ctx.userId,
    "reportes",
    "eliminar",
  );
  if (permisoError) return { error: permisoError };

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Gasto no identificado." };

  const { data: gasto } = await ctx.supabase
    .from("mm_gastos_operativos")
    .select("descripcion")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id)
    .maybeSingle();
  if (!gasto) return { error: "Gasto no encontrado." };

  const impacto = await getImpactoCajaGasto(ctx.supabase, ctx.tenantId, id);
  if (impacto.sesionId && !impacto.sesionAbierta) {
    return {
      error:
        "Este gasto ya pasó por un cierre de caja y no se puede eliminar (el arqueo de esa " +
        "sesión ya quedó cuadrado con su egreso). Si fue un error, regístralo como corrección " +
        "en Caja.",
    };
  }
  const impactoCuenta = await getImpactoCuentaPorReferencia(ctx.supabase, ctx.tenantId, id);

  const { error } = await ctx.supabase
    .from("mm_gastos_operativos")
    .update({ deleted_at: new Date().toISOString() })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id);

  if (error) return { error: "No se pudo eliminar el gasto." };

  if (impacto.sesionId && impacto.neto.length > 0) {
    for (const n of impacto.neto) {
      await insertarMovimientoCaja(ctx.supabase, {
        tenantId: ctx.tenantId,
        sesionId: impacto.sesionId,
        tipo: "ingreso",
        monto: n.monto,
        moneda: n.moneda,
        motivo: `Reverso por eliminación de gasto: ${gasto.descripcion}`,
        referencia: id,
        usuarioId: ctx.userId,
      });
    }
    revalidatePath(CAJA_PATH);
  }

  if (impactoCuenta.length > 0) {
    // Bancos no tiene concepto de "cierre" — un gasto digital siempre se
    // puede eliminar, revirtiendo el egreso en su cuenta (mismo criterio de
    // reversa sign-aware que la edición, ver actualizarGastoOperativo).
    for (const n of impactoCuenta) {
      await insertarMovimientoCuenta(ctx.supabase, {
        tenantId: ctx.tenantId,
        cuentaId: n.cuentaId,
        tipo: n.netoUsd >= 0 ? "ingreso" : "egreso",
        montoUsd: Math.abs(n.netoUsd),
        montoBs: Math.abs(n.netoBs),
        motivo: `Reverso por eliminación de gasto: ${gasto.descripcion}`,
        referencia: id,
        usuarioId: ctx.userId,
      });
    }
    revalidatePath(BANCOS_PATH);
  }

  revalidatePath(GASTOS_PATH);
  revalidatePath(GANANCIAS_PATH);
  return { ok: true };
}
