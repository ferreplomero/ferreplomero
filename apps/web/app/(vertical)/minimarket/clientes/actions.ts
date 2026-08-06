"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  getTasaVigente,
  getTipoPreferido,
  getTodasLasTasas,
  TIPO_TASA_LABEL,
  type TipoTasa,
} from "@/lib/minimarket/exchange-rate";
import { IGTF_RATE, METODOS_ABONO, causaIgtf } from "@/lib/minimarket/constants";
import { getClienteConSaldo, getFiadosAbiertos } from "@/lib/minimarket/data/clientes";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { medianocheLocalAUtcISO } from "@/lib/minimarket/date-format";
import { requirePermisoAccion } from "@/lib/minimarket/permisos";
import { esEfectivo } from "@/lib/minimarket/pos-calc";
import { esMetodoConCuenta } from "@/lib/minimarket/bancos";
import { getSesionAbierta, insertarMovimientoCaja } from "@/lib/minimarket/data/caja";
import { insertarMovimientoCuenta } from "@/lib/minimarket/data/bancos";
import type { MmMetodoPago } from "@arkiteq/db";

const CLIENTES_PATH = "/minimarket/clientes";
const FIADO_PATH = "/minimarket/fiado";
const redondear = (n: number) => Math.round(n * 100) / 100;

export interface ClienteResult {
  ok?: boolean;
  clienteId?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export interface AbonoResult {
  ok?: boolean;
  error?: string;
  abonoIds?: string[];
  /** Recibo para mostrar al usuario. */
  recibo?: {
    clienteNombre: string;
    montoUsd: number;
    montoBs: number;
    igtfUsd: number;
    metodo: string;
    tasa: number;
    saldoAnterior: number;
    saldoNuevo: number;
    fecha: string;
    /** Aviso no bloqueante: el abono se registró y el saldo del cliente ya
     * bajó, pero el ingreso no quedó reflejado en Caja/Bancos (ej. caja
     * cerrada, o el insert del movimiento falló). */
    avisoCaja?: string;
  };
}

// -----------------------------------------------------------------------
// Schemas de validación
// -----------------------------------------------------------------------

const cedula = z
  .string()
  .trim()
  .max(20)
  .regex(/^[VEJGvejg]\d{6,9}$/, "Cédula inválida. Usa formato V12345678 o E12345678.")
  .optional()
  .or(z.literal(""));

const clienteSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres.").max(120),
  cedula: cedula,
  telefono: z.string().trim().max(20).optional().or(z.literal("")),
  whatsapp: z.string().trim().max(20).optional().or(z.literal("")),
  direccion: z.string().trim().max(320).optional().or(z.literal("")),
  limite_fiado_usd: z.coerce
    .number({ invalid_type_error: "El límite de fiado debe ser un número." })
    .min(0, "El límite no puede ser negativo.")
    .max(100_000, "Límite máximo: $100.000"),
  notas: z.string().trim().max(500).optional().or(z.literal("")),
  activo: z.boolean(),
});

const abonoSchema = z.object({
  cliente_id: z.string().uuid("Cliente inválido."),
  monto_usd: z.coerce
    .number({ invalid_type_error: "El monto debe ser un número." })
    .positive("El monto debe ser mayor a cero."),
  metodo: z.enum(
    ["efectivo_bs", "efectivo_usd", "pago_movil", "transferencia", "zelle", "tarjeta"] as const,
    { errorMap: () => ({ message: "Método de pago inválido." }) },
  ),
  /** Cuenta bancaria elegida por el cajero para métodos con cuenta (pago
   * móvil/transferencia/Zelle/tarjeta) — opcional: si el negocio solo tiene
   * una cuenta activa para el método, no hay selector y esto llega vacío. */
  cuenta_bancaria_id: z.string().uuid().optional().or(z.literal("")),
});

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function toNullable(v: string | undefined): string | null {
  return v && v.length > 0 ? v : null;
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(error.issues.map((i) => [i.path[0], i.message]));
}

// -----------------------------------------------------------------------
// Acciones
// -----------------------------------------------------------------------

/** Crea un nuevo cliente. Devuelve el id para redirigir al estado de cuenta. */
export async function crearCliente(
  _prev: ClienteResult,
  formData: FormData,
): Promise<ClienteResult> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { error: "Sesión no válida." };

  const raw = {
    nombre: formData.get("nombre"),
    cedula: formData.get("cedula") ?? "",
    telefono: formData.get("telefono") ?? "",
    whatsapp: formData.get("whatsapp") ?? "",
    direccion: formData.get("direccion") ?? "",
    limite_fiado_usd: formData.get("limite_fiado_usd"),
    notas: formData.get("notas") ?? "",
    activo: formData.get("activo") === "true",
  };

  const parsed = clienteSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const d = parsed.data;
  const supabase = await createClient();
  const permisoError = await requirePermisoAccion(
    supabase,
    tenantId,
    session.user.id,
    "clientes",
    "crear",
  );
  if (permisoError) return { error: permisoError };

  const { data, error } = await supabase
    .from("mm_clientes")
    .insert({
      tenant_id: tenantId,
      nombre: d.nombre,
      cedula: toNullable(d.cedula),
      telefono: toNullable(d.telefono),
      whatsapp: toNullable(d.whatsapp),
      direccion: toNullable(d.direccion),
      limite_fiado_usd: d.limite_fiado_usd,
      notas: toNullable(d.notas),
      activo: d.activo,
    })
    .select("id")
    .single();

  if (error) return { error: "No se pudo crear el cliente. Inténtalo de nuevo." };

  revalidatePath(CLIENTES_PATH);
  return { ok: true, clienteId: data.id };
}

/** Actualiza los datos de un cliente existente. */
export async function actualizarCliente(
  clienteId: string,
  _prev: ClienteResult,
  formData: FormData,
): Promise<ClienteResult> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { error: "Sesión no válida." };

  const raw = {
    nombre: formData.get("nombre"),
    cedula: formData.get("cedula") ?? "",
    telefono: formData.get("telefono") ?? "",
    whatsapp: formData.get("whatsapp") ?? "",
    direccion: formData.get("direccion") ?? "",
    limite_fiado_usd: formData.get("limite_fiado_usd"),
    notas: formData.get("notas") ?? "",
    activo: formData.get("activo") === "true",
  };

  const parsed = clienteSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const d = parsed.data;
  const supabase = await createClient();
  const permisoError = await requirePermisoAccion(
    supabase,
    tenantId,
    session.user.id,
    "clientes",
    "editar",
  );
  if (permisoError) return { error: permisoError };

  const { error } = await supabase
    .from("mm_clientes")
    .update({
      nombre: d.nombre,
      cedula: toNullable(d.cedula),
      telefono: toNullable(d.telefono),
      whatsapp: toNullable(d.whatsapp),
      direccion: toNullable(d.direccion),
      limite_fiado_usd: d.limite_fiado_usd,
      notas: toNullable(d.notas),
      activo: d.activo,
      updated_at: new Date().toISOString(),
    })
    .eq("id", clienteId)
    .eq("tenant_id", tenantId);

  if (error) return { error: "No se pudo actualizar el cliente." };

  revalidatePath(CLIENTES_PATH);
  revalidatePath(`${CLIENTES_PATH}/${clienteId}`);
  return { ok: true, clienteId };
}

/**
 * Registra un abono al fiado de un cliente.
 *
 * Aplica el pago en orden FIFO (fiado más antiguo primero). Si el abono cubre
 * varios fiados, crea un registro mm_abonos_fiado por cada uno y los marca
 * como 'pagado' al quedar saldados. El saldo siempre se recalcula del ledger,
 * nunca de un contador mutable.
 */
export async function registrarAbono(_prev: AbonoResult, formData: FormData): Promise<AbonoResult> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { error: "Sesión no válida." };

  const raw = {
    cliente_id: formData.get("cliente_id"),
    monto_usd: formData.get("monto_usd"),
    metodo: formData.get("metodo"),
    cuenta_bancaria_id: formData.get("cuenta_bancaria_id") ?? "",
  };

  const parsed = abonoSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const { cliente_id, monto_usd, metodo, cuenta_bancaria_id } = parsed.data;

  const supabase = await createClient();
  const permisoError = await requirePermisoAccion(
    supabase,
    tenantId,
    session.user.id,
    "fiado",
    "crear",
  );
  if (permisoError) return { error: permisoError };

  const metodoTyped = metodo as MmMetodoPago;
  const esCuentaMetodo = esMetodoConCuenta(metodoTyped);

  const [cliente, tasa, configRes, sesionCaja, cuentaRes] = await Promise.all([
    getClienteConSaldo(supabase, tenantId, cliente_id),
    getTasaVigente(supabase, tenantId),
    supabase.from("mm_config_negocio").select("parametros").eq("tenant_id", tenantId).maybeSingle(),
    esEfectivo(metodoTyped) ? getSesionAbierta(supabase, tenantId) : Promise.resolve(null),
    esCuentaMetodo && cuenta_bancaria_id
      ? supabase
          .from("mm_cuentas_bancarias")
          .select("id, metodo")
          .eq("tenant_id", tenantId)
          .eq("id", cuenta_bancaria_id)
          .is("deleted_at", null)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (!cliente) return { error: "Cliente no encontrado." };
  if (!tasa) return { error: "Define la tasa del día antes de registrar un abono." };

  if (monto_usd > cliente.saldo_usd + 0.001) {
    return {
      error: `El abono ($${monto_usd.toFixed(2)}) supera el saldo del cliente ($${cliente.saldo_usd.toFixed(2)}).`,
    };
  }

  // Mismo criterio que `registrarVenta` (ventas/actions.ts): el IGTF solo se
  // cobra si el negocio lo tiene activo en su configuración. `!== false` para
  // que, si el campo nunca se guardó, el comportamiento por defecto no cambie.
  const params = (configRes.data?.parametros as Record<string, unknown>) ?? {};
  const igtfActivo = params.igtf_activo !== false;

  const igtf_usd =
    igtfActivo && causaIgtf(metodo as Parameters<typeof causaIgtf>[0])
      ? redondear(monto_usd * IGTF_RATE)
      : 0;
  const monto_bs = redondear(monto_usd * tasa.valor);

  // Monto que REALMENTE entra al negocio (lo que el cliente entrega): la
  // porción que reduce la deuda más el IGTF, que es un cargo aparte que no
  // abona al fiado pero sí es plata/pago digital recibido — mismo criterio
  // que usa `registrarVenta` con los montos de `v.pagos` (ya incluyen el
  // IGTF que el cajero cobra encima del total). Si no hay IGTF, es igual a
  // `monto_usd`.
  const montoRecibidoUsd = redondear(monto_usd + igtf_usd);
  const montoRecibidoBs = redondear(montoRecibidoUsd * tasa.valor);

  // Cuenta bancaria elegida por el cajero, revalidada contra la base (igual
  // patrón que `cuentaValidaParaPago` en ventas/actions.ts): debe existir,
  // pertenecer al tenant y coincidir con el método del abono. Si no es
  // válida, el ingreso a Bancos simplemente se omite (best effort).
  const cuentaValidaId =
    esCuentaMetodo && cuentaRes.data && cuentaRes.data.metodo === metodoTyped
      ? cuentaRes.data.id
      : null;

  // Distribuir el pago en FIFO sobre los fiados abiertos.
  const fiadosAbiertos = await getFiadosAbiertos(supabase, tenantId, cliente_id);
  if (!fiadosAbiertos.length) {
    return { error: "El cliente no tiene fiados abiertos." };
  }

  let restante = monto_usd;
  const abonoIds: string[] = [];
  const fiadosPagadosPorEsteLlamado: string[] = [];
  let conflictoConcurrencia = false;

  for (const fiado of fiadosAbiertos) {
    if (restante <= 0) break;

    // Guardia atómica contra dos abonos simultáneos al mismo fiado (dos
    // pestañas, dos cajeros cobrando la misma deuda a la vez): antes se leía
    // la suma de `mm_abonos_fiado` y se calculaba la porción SIN reservar
    // nada, así que dos llamadas concurrentes podían leer el mismo pendiente
    // y las dos insertar abonos que juntos superan la deuda real. Este UPDATE
    // solo tiene efecto si `updated_at` sigue siendo el que se leyó en
    // `getFiadosAbiertos` — si otra llamada ya tocó este fiado mientras
    // tanto, `data` viene null y el fiado se salta en vez de sobre-abonarse.
    // Mismo patrón que `reservarConversionPresupuesto`
    // (presupuestos/actions.ts), usando `updated_at` como columna de versión
    // en vez de `estado` porque acá el estado ("abierto") no cambia entre
    // abonos parciales.
    const { data: reservado } = await supabase
      .from("mm_fiados")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", fiado.id)
      .eq("tenant_id", tenantId)
      .eq("updated_at", fiado.updated_at)
      .select("id, updated_at")
      .maybeSingle();

    if (!reservado) {
      conflictoConcurrencia = true;
      continue;
    }

    // Ya reservado en exclusiva: recién ahora se lee el pendiente real —
    // ninguna otra llamada puede haber insertado un abono para este fiado sin
    // antes ganar la misma reserva.
    const { data: abonosDelFiado } = await supabase
      .from("mm_abonos_fiado")
      .select("monto_usd")
      .eq("fiado_id", fiado.id);

    const yaAbonado = (abonosDelFiado ?? []).reduce((s, a) => s + Number(a.monto_usd), 0);
    const pendienteFiado = Math.max(0, Number(fiado.monto_usd) - yaAbonado);
    if (pendienteFiado <= 0) continue;

    const porcion = redondear(Math.min(restante, pendienteFiado));
    restante = redondear(restante - porcion);

    // Prorratear el IGTF proporcionalmente al monto cubierto por este fiado.
    const proporcion = porcion / monto_usd;
    const igtfPorcion = redondear(igtf_usd * proporcion);
    const bsPorcion = redondear(porcion * tasa.valor);

    const { data: abono, error: aErr } = await supabase
      .from("mm_abonos_fiado")
      .insert({
        tenant_id: tenantId,
        fiado_id: fiado.id,
        cliente_id,
        monto_usd: porcion,
        monto_bs: bsPorcion,
        igtf_usd: igtfPorcion,
        tasa_usada: tasa.valor,
        metodo,
        usuario_id: session.user.id,
      })
      .select("id")
      .single();

    if (aErr || !abono) return { error: "Error al registrar el abono. Inténtalo de nuevo." };
    abonoIds.push(abono.id);

    // Marcar fiado como pagado si el total de abonos cubre el monto — ya
    // tenemos la reserva exclusiva de arriba, así que este update no necesita
    // guardia adicional.
    const totalAbonado = yaAbonado + porcion;
    if (totalAbonado >= Number(fiado.monto_usd) - 0.001) {
      await supabase
        .from("mm_fiados")
        .update({ estado: "pagado", updated_at: new Date().toISOString() })
        .eq("id", fiado.id)
        .eq("tenant_id", tenantId);
      fiadosPagadosPorEsteLlamado.push(fiado.id);
    }
  }

  // Si algún fiado se saltó por un conflicto de concurrencia Y quedó dinero
  // sin ubicar, no se puede completar el abono con certeza (el reparto FIFO
  // calculado ya no es confiable) — se revierte TODO lo que este llamado
  // insertó y se le pide al cajero reintentar con el saldo ya actualizado,
  // en vez de dejar un abono parcial silencioso o sobre-cobrar al cliente.
  if (conflictoConcurrencia && restante > 0.001) {
    if (abonoIds.length > 0) {
      await supabase.from("mm_abonos_fiado").delete().in("id", abonoIds);
    }
    for (const fiadoId of fiadosPagadosPorEsteLlamado) {
      await supabase
        .from("mm_fiados")
        .update({ estado: "abierto", updated_at: new Date().toISOString() })
        .eq("id", fiadoId)
        .eq("tenant_id", tenantId);
    }
    return {
      error:
        "El saldo de este cliente cambió mientras se procesaba el abono (probablemente otro abono simultáneo). No se cobró nada — revisa el saldo actualizado e inténtalo de nuevo.",
    };
  }

  const saldoNuevo = redondear(Math.max(0, cliente.saldo_usd - monto_usd));

  // Conectar el ingreso a Caja/Bancos — UNA sola vez por abono (fuera del
  // `for` de arriba), sin importar en cuántos `mm_abonos_fiado` se repartió
  // el pago. Igual que en `registrarVenta`, esto es "best effort": si falla
  // o no hay dónde registrarlo, el abono ya registrado NUNCA se revierte
  // (el saldo del cliente ya bajó correctamente); solo se avisa en el recibo.
  const primerAbonoId = abonoIds[0];
  let avisoCaja: string | undefined;

  if (esEfectivo(metodoTyped)) {
    if (sesionCaja) {
      const { error: errorCaja } = await insertarMovimientoCaja(supabase, {
        tenantId,
        sesionId: sesionCaja.id,
        tipo: "ingreso",
        monto: metodoTyped === "efectivo_usd" ? montoRecibidoUsd : montoRecibidoBs,
        moneda: metodoTyped === "efectivo_usd" ? "USD" : "VES",
        motivo: `Abono — ${cliente.nombre}`,
        referencia: primerAbonoId,
        usuarioId: session.user.id,
      });
      if (errorCaja) {
        avisoCaja = "El abono quedó registrado, pero no se pudo reflejar el ingreso en Caja.";
      }
    } else {
      avisoCaja =
        "El abono quedó registrado, pero la caja está cerrada: este ingreso no quedó reflejado ahí.";
    }
  } else if (esCuentaMetodo) {
    if (cuentaValidaId) {
      const { error: errorCuenta } = await insertarMovimientoCuenta(supabase, {
        tenantId,
        cuentaId: cuentaValidaId,
        tipo: "ingreso",
        montoUsd: montoRecibidoUsd,
        montoBs: montoRecibidoBs,
        tasaUsada: tasa.valor,
        motivo: `Abono — ${cliente.nombre}`,
        referencia: primerAbonoId,
        usuarioId: session.user.id,
      });
      if (errorCuenta) {
        avisoCaja = "El abono quedó registrado, pero no se pudo reflejar el ingreso en Bancos.";
      }
    } else {
      avisoCaja =
        "El abono quedó registrado, pero no hay una cuenta bancaria configurada para este método: el ingreso no quedó reflejado en Bancos.";
    }
  }

  revalidatePath(CLIENTES_PATH);
  revalidatePath(`${CLIENTES_PATH}/${cliente_id}`);

  return {
    ok: true,
    abonoIds,
    recibo: {
      clienteNombre: cliente.nombre,
      montoUsd: monto_usd,
      montoBs: monto_bs,
      igtfUsd: igtf_usd,
      metodo: METODOS_ABONO.find((m) => m.value === metodo)?.label ?? metodo,
      tasa: tasa.valor,
      saldoAnterior: cliente.saldo_usd,
      saldoNuevo,
      fecha: new Date().toISOString(),
      avisoCaja,
    },
  };
}

/**
 * Genera el enlace wa.me para enviar un recordatorio de cobro al cliente.
 * No requiere API de WhatsApp Business — el usuario lo envía desde su celular.
 */
export async function generarRecordatorioWhatsApp(
  clienteId: string,
): Promise<{ ok?: boolean; url?: string; error?: string }> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { error: "Sesión no válida." };

  const supabase = await createClient();

  const [cliente, config, tasa] = await Promise.all([
    getClienteConSaldo(supabase, tenantId, clienteId),
    supabase
      .from("mm_config_negocio")
      .select("nombre_comercial")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    getTasaVigente(supabase, tenantId),
  ]);

  if (!cliente) return { error: "Cliente no encontrado." };
  if (!cliente.whatsapp && !cliente.telefono) {
    return { error: "El cliente no tiene número de WhatsApp registrado." };
  }

  const negocio = config.data?.nombre_comercial ?? "el negocio";
  const saldoUsd = cliente.saldo_usd.toFixed(2);
  const saldoBs = tasa ? (cliente.saldo_usd * tasa.valor).toFixed(2) : null;
  const saldoTexto = saldoBs ? `$${saldoUsd} USD (${saldoBs} Bs)` : `$${saldoUsd} USD`;

  const mensaje = [
    `Hola ${cliente.nombre}, le saluda ${negocio}.`,
    `Le recordamos que tiene un saldo pendiente de *${saldoTexto}*.`,
    `Por favor comuníquese con nosotros para coordinar el pago. ¡Gracias!`,
  ].join(" ");

  const telefono = (cliente.whatsapp ?? cliente.telefono ?? "")
    .replace(/\D/g, "")
    .replace(/^0/, "58");

  const url = `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`;

  return { ok: true, url };
}

// ============================ Carga masiva de fiados ==========================

/** Cédula venezolana: letra V/E/J/G + 6 a 9 dígitos, sin guion (mismo formato que `CedulaInput`). */
const CEDULA_REGEX = /^[VEJGvejg]\d{6,9}$/;

/** Normaliza para comparar (cédula o nombre): sin mayúsculas ni espacios de más. */
function normalizarTexto(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseTipoTasaFiado(raw: string): TipoTasa | undefined {
  const s = normalizarTexto(raw);
  if (s === "bcv") return "bcv";
  if (s === "euro" || s === "eur") return "euro";
  if (["personalizada", "personalizado", "manual", "digital"].includes(s)) return "manual";
  return undefined;
}

/** Parser CSV mínimo, consciente de comillas dobles (campos con comas). */
function parseCsvLineFiado(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let enComillas = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (enComillas) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          enComillas = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      enComillas = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const numFiado = (s: string | undefined): number => Number((s ?? "").replace(",", "."));

interface FilaFiado {
  linea: number;
  nombre: string;
  /** Ya normalizada a mayúsculas ("" si no vino). */
  cedula: string;
  telefono: string;
  whatsapp: string;
  direccion: string;
  limiteFiadoUsd: number;
  /** Monto en la moneda ORIGINAL de la fila (antes de convertir a USD). */
  montoAdeudado: number;
  moneda: "USD" | "Bs";
  tasaTipo?: TipoTasa;
  /** "" o AAAA-MM-DD. */
  fechaDeuda: string;
  nota: string;
  errorFormato?: string;
}

/**
 * Parsea el texto CSV (pegado o convertido desde un .xlsx/.csv subido) a
 * filas estructuradas, SIN tocar la base de datos. Columnas (en orden):
 *   nombre, cedula, telefono, whatsapp, direccion, limite_fiado_usd,
 *   monto_adeudado, moneda, tasa, fecha_deuda, nota
 * Solo nombre es obligatorio. `monto_adeudado` vacío/0 = cliente sin deuda
 * (se crea/asocia igual, solo que sin fiado). Compartido entre la
 * previsualización y la importación real para que ambas vean exactamente las
 * mismas filas y los mismos números de línea.
 */
function parseFilasFiado(texto: string): { filas: FilaFiado[]; errorGeneral?: string } {
  const lineas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lineas.length === 0)
    return { filas: [], errorGeneral: "Sube o pega al menos una fila de datos." };
  const cabecera = lineas[0] ?? "";
  if (/nombre/i.test(cabecera) && /(c[eé]dula|monto)/i.test(cabecera)) lineas.shift();
  if (lineas.length === 0) {
    return { filas: [], errorGeneral: "No hay filas de datos bajo el encabezado." };
  }

  const filas: FilaFiado[] = lineas.map((linea, i) => {
    const cols = parseCsvLineFiado(linea);
    const nombre = (cols[0] ?? "").trim();
    const cedulaRaw = (cols[1] ?? "").trim();
    const telefono = (cols[2] ?? "").trim();
    const whatsapp = (cols[3] ?? "").trim();
    const direccion = (cols[4] ?? "").trim();
    const limiteFiadoUsd = numFiado(cols[5]) || 0;
    const montoRaw = (cols[6] ?? "").trim();
    const montoAdeudado = montoRaw === "" ? 0 : numFiado(montoRaw);
    const monedaRaw = (cols[7] ?? "").trim().toLowerCase();
    const moneda: "USD" | "Bs" = monedaRaw === "bs" ? "Bs" : "USD";
    const tasaRaw = (cols[8] ?? "").trim();
    const tasaTipo = tasaRaw === "" ? undefined : parseTipoTasaFiado(tasaRaw);
    const fechaDeuda = (cols[9] ?? "").trim();
    const nota = (cols[10] ?? "").trim();

    let errorFormato: string | undefined;
    if (!nombre || nombre.length < 2) {
      errorFormato = "Falta el nombre (mínimo 2 caracteres).";
    } else if (cedulaRaw && !CEDULA_REGEX.test(cedulaRaw)) {
      errorFormato = "Cédula inválida. Usa formato V12345678 o E12345678.";
    } else if (montoRaw !== "" && (!Number.isFinite(montoAdeudado) || montoAdeudado < 0)) {
      errorFormato = "Monto adeudado inválido.";
    } else if (fechaDeuda !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(fechaDeuda)) {
      errorFormato = "Fecha de la deuda inválida (usa AAAA-MM-DD).";
    } else if (moneda === "Bs" && tasaRaw !== "" && tasaTipo === undefined) {
      errorFormato = `Tasa "${tasaRaw}" no reconocida (usa bcv, euro o personalizada).`;
    } else if (!Number.isFinite(limiteFiadoUsd) || limiteFiadoUsd < 0) {
      errorFormato = "Límite de fiado inválido.";
    }

    return {
      linea: i + 1,
      nombre,
      cedula: cedulaRaw.toUpperCase(),
      telefono,
      whatsapp,
      direccion,
      limiteFiadoUsd,
      montoAdeudado,
      moneda,
      tasaTipo,
      fechaDeuda,
      nota,
      errorFormato,
    };
  });

  return { filas };
}

export interface FilaPreviewFiado {
  linea: number;
  nombre: string;
  cedula: string;
  estado: "cliente_nuevo" | "cliente_existente" | "error";
  motivo?: string;
  monto_usd: number;
  moneda_original: "USD" | "Bs";
  monto_original: number;
}

export interface PreviewCargaFiadosResult {
  ok?: boolean;
  error?: string;
  filas?: FilaPreviewFiado[];
  resumen?: {
    total: number;
    clientesNuevos: number;
    clientesExistentes: number;
    errores: number;
    totalAdeudadoUsd: number;
  };
}

/**
 * Valida el CSV y determina, por fila, si el cliente ya existe (por cédula o
 * nombre) o se va a crear — SIN escribir nada en la base de datos. Convierte
 * a USD (moneda base del sistema) los montos en Bs con la tasa indicada, para
 * mostrar en la vista previa el monto real que se registrará.
 */
export async function previsualizarCargaFiados(csv: string): Promise<PreviewCargaFiadosResult> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { error: "Sesión no válida." };

  const supabase = await createClient();
  const permisoError = await requirePermisoAccion(
    supabase,
    tenantId,
    session.user.id,
    "clientes",
    "crear",
  );
  if (permisoError) return { error: permisoError };

  const { filas, errorGeneral } = parseFilasFiado(csv);
  if (errorGeneral) return { error: errorGeneral };

  const [{ data: clientesData }, tipoPreferido, todasLasTasas] = await Promise.all([
    supabase
      .from("mm_clientes")
      .select("id, nombre, cedula")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null),
    getTipoPreferido(supabase, tenantId),
    getTodasLasTasas(supabase, tenantId),
  ]);

  const porCedula = new Map<string, string>();
  const porNombre = new Map<string, string>();
  for (const c of clientesData ?? []) {
    if (c.cedula) porCedula.set(normalizarTexto(c.cedula), c.id);
    porNombre.set(normalizarTexto(c.nombre), c.id);
  }

  const resultado: FilaPreviewFiado[] = [];
  const clavesNuevasEnLote = new Set<string>();
  let clientesNuevos = 0;
  let clientesExistentes = 0;
  let errores = 0;
  let totalAdeudadoUsd = 0;

  for (const f of filas) {
    const base = {
      linea: f.linea,
      nombre: f.nombre,
      cedula: f.cedula,
      moneda_original: f.moneda,
      monto_original: f.montoAdeudado,
    };

    if (f.errorFormato) {
      errores += 1;
      resultado.push({ ...base, estado: "error", motivo: f.errorFormato, monto_usd: 0 });
      continue;
    }

    let montoUsd = f.montoAdeudado;
    if (f.moneda === "Bs" && f.montoAdeudado > 0) {
      const tipoTasa = f.tasaTipo ?? tipoPreferido;
      const tasaVigente = todasLasTasas[tipoTasa];
      if (!tasaVigente) {
        errores += 1;
        resultado.push({
          ...base,
          estado: "error",
          motivo: `Aún no hay una tasa ${TIPO_TASA_LABEL[tipoTasa]} registrada para convertir el monto en Bs.`,
          monto_usd: 0,
        });
        continue;
      }
      montoUsd = Math.round((f.montoAdeudado / tasaVigente.valor) * 100) / 100;
    }

    const claveCedula = f.cedula ? normalizarTexto(f.cedula) : "";
    const claveNombre = normalizarTexto(f.nombre);
    const claveLote = claveCedula || claveNombre;
    const yaExiste = (claveCedula && porCedula.has(claveCedula)) || porNombre.has(claveNombre);

    let estado: FilaPreviewFiado["estado"];
    let motivo: string | undefined;
    if (yaExiste) {
      estado = "cliente_existente";
      motivo = "Ya existe en el sistema — la deuda se sumará a su cuenta.";
      clientesExistentes += 1;
    } else if (clavesNuevasEnLote.has(claveLote)) {
      estado = "cliente_existente";
      motivo = "Mismo cliente que otra fila de este archivo — se agrupan en un solo cliente nuevo.";
      clientesExistentes += 1;
    } else {
      estado = "cliente_nuevo";
      clavesNuevasEnLote.add(claveLote);
      clientesNuevos += 1;
    }

    totalAdeudadoUsd += montoUsd;
    resultado.push({ ...base, estado, motivo, monto_usd: montoUsd });
  }

  return {
    ok: true,
    filas: resultado,
    resumen: {
      total: filas.length,
      clientesNuevos,
      clientesExistentes,
      errores,
      totalAdeudadoUsd,
    },
  };
}

export interface CargaFiadosResult {
  ok?: boolean;
  error?: string;
  clientesCreados?: number;
  clientesReutilizados?: number;
  fiadosCreados?: number;
  errores?: { linea: number; motivo: string }[];
}

/**
 * Carga masiva de fiados desde CSV (pegado o convertido desde un archivo
 * subido). Por cada fila: si el cliente ya existe (por cédula o, si no vino,
 * por nombre) se reutiliza — nunca se duplica —; si no existe, se crea. Si la
 * fila trae un monto adeudado > 0, se registra como un fiado 'abierto' SIN
 * venta asociada (`venta_id: null`, soportado por el esquema) — es la deuda
 * inicial que el comerciante ya traía en su cuaderno/Excel, no una venta a
 * crédito nueva. El saldo del cliente (`mm_v_saldo_cliente`) lo deriva solo
 * de la suma de fiados abiertos menos abonos, así que aparece correcto en
 * Cuentas por cobrar y Morosos en cuanto se confirma, sin pasos adicionales.
 */
export async function cargaFiados(
  _prev: CargaFiadosResult,
  formData: FormData,
): Promise<CargaFiadosResult> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { error: "Sesión no válida." };

  const supabase = await createClient();
  const permisoError = await requirePermisoAccion(
    supabase,
    tenantId,
    session.user.id,
    "clientes",
    "crear",
  );
  if (permisoError) return { error: permisoError };

  const texto = typeof formData.get("csv") === "string" ? (formData.get("csv") as string) : "";
  const { filas, errorGeneral } = parseFilasFiado(texto);
  if (errorGeneral) return { error: errorGeneral };

  const [{ data: clientesData }, tipoPreferido, todasLasTasas, tz] = await Promise.all([
    supabase
      .from("mm_clientes")
      .select("id, nombre, cedula")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null),
    getTipoPreferido(supabase, tenantId),
    getTodasLasTasas(supabase, tenantId),
    getTimezoneNegocio(supabase, tenantId),
  ]);

  const porCedula = new Map<string, string>();
  const porNombre = new Map<string, string>();
  for (const c of clientesData ?? []) {
    if (c.cedula) porCedula.set(normalizarTexto(c.cedula), c.id);
    porNombre.set(normalizarTexto(c.nombre), c.id);
  }

  const errores: { linea: number; motivo: string }[] = [];
  let clientesCreados = 0;
  let clientesReutilizados = 0;
  let fiadosCreados = 0;

  for (const f of filas) {
    const nLinea = f.linea;
    if (f.errorFormato) {
      errores.push({ linea: nLinea, motivo: f.errorFormato });
      continue;
    }

    let montoUsd = f.montoAdeudado;
    if (f.moneda === "Bs" && f.montoAdeudado > 0) {
      const tipoTasa = f.tasaTipo ?? tipoPreferido;
      const tasaVigente = todasLasTasas[tipoTasa];
      if (!tasaVigente) {
        errores.push({
          linea: nLinea,
          motivo: `Aún no hay una tasa ${TIPO_TASA_LABEL[tipoTasa]} registrada para convertir el monto en Bs.`,
        });
        continue;
      }
      montoUsd = Math.round((f.montoAdeudado / tasaVigente.valor) * 100) / 100;
    }

    const claveCedula = f.cedula ? normalizarTexto(f.cedula) : "";
    const claveNombre = normalizarTexto(f.nombre);
    let clienteId = claveCedula ? porCedula.get(claveCedula) : undefined;
    if (!clienteId) clienteId = porNombre.get(claveNombre);

    if (!clienteId) {
      const { data: nuevoCliente, error: errCliente } = await supabase
        .from("mm_clientes")
        .insert({
          tenant_id: tenantId,
          nombre: f.nombre,
          cedula: f.cedula || null,
          telefono: f.telefono || null,
          whatsapp: f.whatsapp || null,
          direccion: f.direccion || null,
          limite_fiado_usd: f.limiteFiadoUsd,
        })
        .select("id")
        .single();

      if (errCliente || !nuevoCliente) {
        errores.push({ linea: nLinea, motivo: "No se pudo crear el cliente." });
        continue;
      }
      clienteId = nuevoCliente.id;
      clientesCreados += 1;
      if (claveCedula) porCedula.set(claveCedula, clienteId);
      porNombre.set(claveNombre, clienteId);
    } else {
      clientesReutilizados += 1;
    }

    if (montoUsd > 0) {
      const marcaTiempo = f.fechaDeuda
        ? medianocheLocalAUtcISO(f.fechaDeuda, tz)
        : new Date().toISOString();

      const { error: errFiado } = await supabase.from("mm_fiados").insert({
        tenant_id: tenantId,
        cliente_id: clienteId,
        venta_id: null,
        monto_usd: montoUsd,
        estado: "abierto",
        nota: f.nota || null,
        created_at: marcaTiempo,
        updated_at: marcaTiempo,
      });

      if (errFiado) {
        errores.push({
          linea: nLinea,
          motivo: `El cliente se creó/asoció, pero no se pudo registrar la deuda: ${errFiado.message}`,
        });
        continue;
      }
      fiadosCreados += 1;
    }
  }

  revalidatePath(CLIENTES_PATH);
  revalidatePath(FIADO_PATH);
  revalidatePath(`${FIADO_PATH}/morosos`);
  return { ok: true, clientesCreados, clientesReutilizados, fiadosCreados, errores };
}
