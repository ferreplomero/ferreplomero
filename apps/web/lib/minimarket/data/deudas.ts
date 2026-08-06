/**
 * Capa de datos del módulo Deudas: pasivos del DUEÑO/NEGOCIO (préstamos,
 * servicios, alquiler, deudas familiares, impuestos, etc.) — distinto de
 * "cuentas por pagar a proveedores" (mm_compras en borrador, ver
 * lib/minimarket/data/compras.ts), que es mercancía recibida pendiente de
 * pago, sin plazos ni abonos parciales.
 *
 * El saldo de una deuda nunca es un contador editable: se deriva del ledger
 * append-only (monto_usd - SUM(mm_abonos_deuda)) en la vista
 * mm_v_saldo_deuda, mismo criterio que mm_v_saldo_cliente en fiado.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MmAbonoDeuda, MmCategoriaDeuda, MmDeuda, MmDeudaEstado } from "@arkiteq/db";
import { hoyEnTz } from "../date-format";

type Client = SupabaseClient<Database>;

/** Categorías comunes precargadas la primera vez que un negocio usa el módulo. */
const CATEGORIAS_DEFECTO = [
  "Préstamos",
  "Servicios",
  "Alquiler",
  "Familiares",
  "Impuestos",
  "Otros",
];

export interface DeudaConSaldo extends MmDeuda {
  categoria_nombre: string | null;
  pagado_usd: number;
  saldo_usd: number;
  /** Calculado (no guardado): pendiente + vencimiento ya pasado, igual que "moroso" en clientes. */
  vencida: boolean;
}

export interface DeudaConAbonos extends DeudaConSaldo {
  abonos: MmAbonoDeuda[];
}

export interface CategoriaResumen {
  categoriaId: string | null;
  categoriaNombre: string;
  saldoUsd: number;
}

export interface ResumenDeudas {
  totalAdeudadoUsd: number;
  cantidadPendientes: number;
  cantidadVencidas: number;
  porCategoria: CategoriaResumen[];
}

function esVencida(estado: MmDeudaEstado, vencimiento: string | null, hoy: string): boolean {
  return estado === "pendiente" && vencimiento !== null && vencimiento < hoy;
}

/**
 * Lista las categorías de deudas del tenant. Si todavía no tiene ninguna
 * (primera vez que entra al módulo), siembra un set de categorías comunes
 * editables — idempotente, mismo criterio que `aprovisionarMinimarketInicial`.
 */
export async function listCategoriasDeuda(
  client: Client,
  tenantId: string,
): Promise<MmCategoriaDeuda[]> {
  const { data, error } = await client
    .from("mm_categorias_deuda")
    .select("*")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("nombre", { ascending: true });

  if (error) throw new Error(`No se pudieron cargar las categorías: ${error.message}`);
  if (data && data.length > 0) return data;

  const { data: creadas, error: insError } = await client
    .from("mm_categorias_deuda")
    .insert(CATEGORIAS_DEFECTO.map((nombre) => ({ tenant_id: tenantId, nombre })))
    .select("*");

  if (insError) {
    throw new Error(`No se pudieron crear las categorías por defecto: ${insError.message}`);
  }
  return (creadas ?? []).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Lista todas las deudas del tenant con su saldo derivado del ledger de abonos. */
export async function listDeudas(
  client: Client,
  tenantId: string,
  tz: string,
): Promise<DeudaConSaldo[]> {
  const [{ data: deudas, error }, { data: saldos }, { data: categorias }] = await Promise.all([
    client
      .from("mm_deudas")
      .select("*")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("fecha", { ascending: false }),
    client
      .from("mm_v_saldo_deuda")
      .select("deuda_id, pagado_usd, saldo_usd")
      .eq("tenant_id", tenantId),
    client.from("mm_categorias_deuda").select("id, nombre").eq("tenant_id", tenantId),
  ]);

  if (error) throw new Error(`No se pudieron cargar las deudas: ${error.message}`);

  const saldoMap = new Map((saldos ?? []).map((s) => [s.deuda_id, s]));
  const catMap = new Map((categorias ?? []).map((c) => [c.id, c.nombre]));
  const hoy = hoyEnTz(tz);

  return (deudas ?? []).map((d) => {
    const s = saldoMap.get(d.id);
    return {
      ...d,
      categoria_nombre: d.categoria_id ? (catMap.get(d.categoria_id) ?? null) : null,
      pagado_usd: Number(s?.pagado_usd ?? 0),
      saldo_usd: Number(s?.saldo_usd ?? d.monto_usd),
      vencida: esVencida(d.estado, d.vencimiento, hoy),
    };
  });
}

/** Devuelve una deuda con su saldo e historial de abonos, o null si no existe. */
export async function getDeudaConAbonos(
  client: Client,
  tenantId: string,
  deudaId: string,
  tz: string,
): Promise<DeudaConAbonos | null> {
  const { data: d, error } = await client
    .from("mm_deudas")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", deudaId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(`No se pudo cargar la deuda: ${error.message}`);
  if (!d) return null;

  const [{ data: saldo }, { data: abonos }, categoriaNombre] = await Promise.all([
    client
      .from("mm_v_saldo_deuda")
      .select("pagado_usd, saldo_usd")
      .eq("deuda_id", deudaId)
      .maybeSingle(),
    client
      .from("mm_abonos_deuda")
      .select("*")
      .eq("deuda_id", deudaId)
      .order("created_at", { ascending: true }),
    d.categoria_id
      ? client
          .from("mm_categorias_deuda")
          .select("nombre")
          .eq("id", d.categoria_id)
          .maybeSingle()
          .then((r) => r.data?.nombre ?? null)
      : Promise.resolve(null),
  ]);

  const hoy = hoyEnTz(tz);
  return {
    ...d,
    categoria_nombre: categoriaNombre,
    pagado_usd: Number(saldo?.pagado_usd ?? 0),
    saldo_usd: Number(saldo?.saldo_usd ?? d.monto_usd),
    vencida: esVencida(d.estado, d.vencimiento, hoy),
    abonos: abonos ?? [],
  };
}

/** Resumen general para la vista de Deudas (tarjetas + desglose por categoría). */
/**
 * Deriva el resumen a partir de una lista de deudas ya cargada (misma lógica
 * que antes vivía inline en getResumenDeudas) — permite a páginas que ya
 * llamaron listDeudas() obtener el resumen sin repetir la consulta.
 */
export function resumenDeDeudas(deudas: DeudaConSaldo[]): ResumenDeudas {
  const pendientes = deudas.filter((d) => d.saldo_usd > 0.001);
  const vencidas = pendientes.filter((d) => d.vencida);

  const porCategoriaMap = new Map<string, CategoriaResumen>();
  for (const d of pendientes) {
    const key = d.categoria_id ?? "__sin_categoria__";
    const entry = porCategoriaMap.get(key) ?? {
      categoriaId: d.categoria_id,
      categoriaNombre: d.categoria_nombre ?? "Sin categoría",
      saldoUsd: 0,
    };
    entry.saldoUsd += d.saldo_usd;
    porCategoriaMap.set(key, entry);
  }

  return {
    totalAdeudadoUsd: pendientes.reduce((s, d) => s + d.saldo_usd, 0),
    cantidadPendientes: pendientes.length,
    cantidadVencidas: vencidas.length,
    porCategoria: [...porCategoriaMap.values()].sort((a, b) => b.saldoUsd - a.saldoUsd),
  };
}

export async function getResumenDeudas(
  client: Client,
  tenantId: string,
  tz: string,
): Promise<ResumenDeudas> {
  const deudas = await listDeudas(client, tenantId, tz);
  return resumenDeDeudas(deudas);
}
