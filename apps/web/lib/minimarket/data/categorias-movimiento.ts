/**
 * Capa de datos de las categorías de Gastos operativos y Otros ingresos
 * (`mm_categorias_movimiento`). Catálogo editable por el tenant, con un set
 * preestablecido por `tipo` que se siembra la primera vez que el tenant no
 * tiene ninguna — idempotente, mismo criterio que
 * `listCategoriasDeuda` (ver lib/minimarket/data/deudas.ts).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MmCategoriaMovimiento, MmCategoriaMovimientoTipo } from "@arkiteq/db";

type Client = SupabaseClient<Database>;

const CATEGORIAS_DEFECTO: Record<MmCategoriaMovimientoTipo, string[]> = {
  gasto: [
    "Servicios",
    "Alquiler",
    "Nómina/personal",
    "Mantenimiento",
    "Transporte/flete",
    "Herramientas/insumos",
    "Impuestos/tasas",
    "Publicidad",
    "Otros",
  ],
  otro_ingreso: [
    "Aporte del dueño",
    "Venta de activo",
    "Préstamo recibido",
    "Reembolso",
    "Intereses",
    "Otros",
  ],
};

/**
 * Lista las categorías de un tipo (gasto | otro_ingreso) del tenant. Si
 * todavía no tiene ninguna de ese tipo (primera vez que entra al módulo),
 * siembra el set preestablecido.
 */
export async function listCategoriasMovimiento(
  client: Client,
  tenantId: string,
  tipo: MmCategoriaMovimientoTipo,
): Promise<MmCategoriaMovimiento[]> {
  const { data, error } = await client
    .from("mm_categorias_movimiento")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("tipo", tipo)
    .is("deleted_at", null)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  if (error) throw new Error(`No se pudieron cargar las categorías: ${error.message}`);
  if (data && data.length > 0) return data;

  const nombresDefecto =
    tipo === "gasto" ? CATEGORIAS_DEFECTO.gasto : CATEGORIAS_DEFECTO.otro_ingreso;
  const { data: creadas, error: insError } = await client
    .from("mm_categorias_movimiento")
    .insert(nombresDefecto.map((nombre, orden) => ({ tenant_id: tenantId, tipo, nombre, orden })))
    .select("*");

  if (insError) {
    throw new Error(`No se pudieron crear las categorías por defecto: ${insError.message}`);
  }
  return (creadas ?? []).sort((a, b) => a.orden - b.orden);
}
