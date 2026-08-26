"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { requirePermisoAccion } from "@/lib/minimarket/permisos";
import { sucursalesPermitidas } from "@/lib/minimarket/sucursal-acceso";
import { deltaConSigno } from "@/lib/minimarket/inventario-calc";

const TRANSFERENCIAS_PATH = "/minimarket/inventario/transferencias";
const INVENTARIO_PATH = "/minimarket/inventario";
const MOVIMIENTOS_PATH = "/minimarket/inventario/movimientos";

export interface TransferenciaResult {
  ok?: boolean;
  transferenciaId?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

const itemSchema = z.object({
  producto_id: z.string().uuid(),
  cantidad: z.number().positive("La cantidad debe ser mayor a cero."),
});

const transferenciaSchema = z
  .object({
    sucursal_origen_id: z.string().uuid({ message: "Selecciona la sucursal de origen." }),
    sucursal_destino_id: z.string().uuid({ message: "Selecciona la sucursal de destino." }),
    notas: z.string().trim().max(200).optional().or(z.literal("")),
    items: z.array(itemSchema).min(1, "Agrega al menos un producto."),
  })
  .refine((d) => d.sucursal_origen_id !== d.sucursal_destino_id, {
    message: "La sucursal de origen y de destino deben ser distintas.",
    path: ["sucursal_destino_id"],
  });

function toNull(v: string | undefined): string | null {
  return v && v.length > 0 ? v : null;
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(error.issues.map((i) => [i.path[0], i.message]));
}

/**
 * Registra una transferencia de stock entre dos sucursales del tenant.
 *
 * Orden de escritura, a propósito: primero el movimiento de stock (el paso
 * crítico), y solo si tuvo éxito el documento (cabecera + ítems) para el
 * historial — así, si algo falla a mitad de camino, el peor caso es un
 * movimiento de stock correcto sin su "documento" bonito (reconciliable a
 * mano por `referencia`), nunca al revés.
 */
export async function registrarTransferencia(
  _prev: TransferenciaResult,
  formData: FormData,
): Promise<TransferenciaResult> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { error: "Sesión no válida." };
  const supabase = await createClient();

  const permisoError = await requirePermisoAccion(
    supabase,
    tenantId,
    session.user.id,
    "inventario",
    "crear",
  );
  if (permisoError) return { error: permisoError };

  const itemsRaw = formData.get("items_json");
  let itemsParsed: unknown[];
  try {
    itemsParsed = JSON.parse(typeof itemsRaw === "string" ? itemsRaw : "[]");
    if (!Array.isArray(itemsParsed)) throw new Error();
  } catch {
    return { error: "Los productos de la transferencia son inválidos." };
  }

  const raw = {
    sucursal_origen_id: formData.get("sucursal_origen_id"),
    sucursal_destino_id: formData.get("sucursal_destino_id"),
    notas: formData.get("notas") ?? "",
    items: itemsParsed.map((i) => {
      const obj = i as Record<string, unknown>;
      return { producto_id: obj.producto_id, cantidad: Number(obj.cantidad) };
    }),
  };

  const parsed = transferenciaSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error), error: parsed.error.issues[0]?.message };
  }
  const d = parsed.data;

  // Tanto origen como destino deben estar entre las sucursales PERMITIDAS del
  // usuario — mismo criterio que decide qué sucursales ve en toda la app
  // (dueño/administrador: todas; el resto, solo sus asignaciones). Además de
  // ser el criterio de negocio correcto ("solo quien tiene acceso a ambas, o
  // un rol admin"), evita un error crudo de la base de datos si el usuario
  // intentara forzar una sucursal ajena: la RLS de mm_movimientos_inventario
  // (migración 0111) lo rechazaría igual, pero este chequeo da un mensaje
  // claro antes de escribir nada.
  const permitidas = await sucursalesPermitidas(supabase, tenantId, session.user.id);
  const permitidasIds = new Set(permitidas.map((s) => s.id));
  if (!permitidasIds.has(d.sucursal_origen_id) || !permitidasIds.has(d.sucursal_destino_id)) {
    return { error: "No tienes acceso a una de las sucursales elegidas." };
  }

  // Productos duplicados en la lista (mismo producto agregado dos veces) se
  // consolidan en una sola línea antes de validar/escribir.
  const cantidadPorProducto = new Map<string, number>();
  for (const item of d.items) {
    cantidadPorProducto.set(
      item.producto_id,
      (cantidadPorProducto.get(item.producto_id) ?? 0) + item.cantidad,
    );
  }
  const productoIds = [...cantidadPorProducto.keys()];

  // Stock disponible en ORIGEN, releído fresco justo antes de escribir (nunca
  // se confía en lo que traía el formulario) — se bloquea la transferencia
  // completa si algún producto no alcanza, sin escribir nada.
  const [{ data: stockRows, error: stockError }, { data: productosInfo }] = await Promise.all([
    supabase
      .from("mm_v_stock")
      .select("producto_id, stock_actual")
      .eq("tenant_id", tenantId)
      .eq("sucursal_id", d.sucursal_origen_id)
      .in("producto_id", productoIds),
    supabase
      .from("mm_productos")
      .select("id, nombre")
      .eq("tenant_id", tenantId)
      .in("id", productoIds),
  ]);
  if (stockError) return { error: "No se pudo verificar el stock disponible." };

  const stockPorProducto = new Map(
    (stockRows ?? []).map((r) => [r.producto_id as string, Number(r.stock_actual)]),
  );
  const nombrePorProducto = new Map((productosInfo ?? []).map((p) => [p.id, p.nombre]));

  for (const [productoId, cantidad] of cantidadPorProducto) {
    const disponible = stockPorProducto.get(productoId) ?? 0;
    if (cantidad > disponible) {
      const nombre = nombrePorProducto.get(productoId) ?? "producto";
      return {
        error: `Stock insuficiente de "${nombre}": disponible ${disponible}, solicitado ${cantidad}.`,
      };
    }
  }

  const transferenciaId = crypto.randomUUID();
  const motivoOrigen = "Transferencia entre sucursales";
  const motivoDestino = "Transferencia entre sucursales";

  const filasMovimiento = [
    ...[...cantidadPorProducto].map(([productoId, cantidad]) => ({
      tenant_id: tenantId,
      producto_id: productoId,
      sucursal_id: d.sucursal_origen_id,
      tipo: "salida" as const,
      cantidad: deltaConSigno("salida", cantidad),
      motivo: motivoOrigen,
      referencia: transferenciaId,
      usuario_id: session.user.id,
    })),
    ...[...cantidadPorProducto].map(([productoId, cantidad]) => ({
      tenant_id: tenantId,
      producto_id: productoId,
      sucursal_id: d.sucursal_destino_id,
      tipo: "entrada" as const,
      cantidad: deltaConSigno("entrada", cantidad),
      motivo: motivoDestino,
      referencia: transferenciaId,
      usuario_id: session.user.id,
    })),
  ];

  // Un solo INSERT multi-fila: en Postgres es atómico (entran todas las
  // filas o ninguna) — la salida de origen y la entrada a destino quedan
  // garantizadas en el mismo paso, sin riesgo de aplicar solo una mitad.
  const { error: movError } = await supabase
    .from("mm_movimientos_inventario")
    .insert(filasMovimiento);
  if (movError) {
    return { error: `No se pudo mover el stock: ${movError.message}` };
  }

  const { error: cabeceraError } = await supabase.from("mm_transferencias").insert({
    id: transferenciaId,
    tenant_id: tenantId,
    sucursal_origen_id: d.sucursal_origen_id,
    sucursal_destino_id: d.sucursal_destino_id,
    usuario_id: session.user.id,
    notas: toNull(d.notas),
  });
  if (cabeceraError) {
    return {
      transferenciaId,
      error:
        "El stock se movió correctamente, pero no se pudo guardar el documento de la " +
        "transferencia para el historial.",
    };
  }

  const { error: itemsError } = await supabase.from("mm_transferencias_items").insert(
    [...cantidadPorProducto].map(([productoId, cantidad]) => ({
      tenant_id: tenantId,
      transferencia_id: transferenciaId,
      producto_id: productoId,
      cantidad,
    })),
  );
  if (itemsError) {
    return {
      transferenciaId,
      error:
        "El stock se movió correctamente, pero no se pudieron guardar los detalles de la " +
        "transferencia para el historial.",
    };
  }

  revalidatePath(TRANSFERENCIAS_PATH);
  revalidatePath(INVENTARIO_PATH);
  revalidatePath(MOVIMIENTOS_PATH);
  return { ok: true, transferenciaId };
}
