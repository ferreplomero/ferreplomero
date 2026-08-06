/**
 * Ventas en espera / borrador del POS (carrito + pagos + cliente + tasa que el
 * cajero dejó a medias). Escribe SIEMPRE directo en local (PowerSync) — a
 * diferencia de una venta real, un borrador nunca necesita revalidación de
 * precios/crédito en el servidor porque no descuenta inventario ni mueve
 * dinero: solo se vuelve una venta real cuando el cajero confirma el cobro
 * (ver `pos-cliente.tsx`, que borra la fila al confirmar).
 *
 * Vive en `mm_ventas_pendientes` (0037_minimarket_ventas_pendientes.sql), una
 * tabla separada de `mm_ventas` a propósito. PowerSync encola cada
 * insert/update/delete y lo sube solo cuando vuelve la señal — igual que el
 * resto del camino local (ver `registrar-venta-local.ts`), así que un
 * borrador sobrevive al cierre del navegador y se sincroniza entre
 * dispositivos del mismo negocio.
 *
 * `estado` (0038_ventas_pendientes_estado.sql) distingue DOS cosas que se
 * parecen pero no son lo mismo:
 *  - 'activo'    -> el borrador que ESTE dispositivo tiene abierto ahora
 *                   mismo en el carrito (autoguardado continuo, para
 *                   sobrevivir a un cierre/recarga). Nunca aparece en "En
 *                   espera": el cajero ya lo ve de frente en el carrito.
 *  - 'en_espera' -> el cajero lo dejó a un lado A PROPÓSITO (cerró el
 *                   diálogo de cobro sin pagar, o tocó "Dejar en espera")
 *                   para atender otra venta. SÍ aparece en "En espera".
 * El panel de "En espera" filtra solo por este campo — nunca por comparar
 * ids en memoria del cliente, que es justo el truco frágil que causaba que
 * una venta se guardara bien pero no apareciera en el panel.
 */
import { z } from "zod";
import type { AbstractPowerSyncDatabase } from "@powersync/web";
import type { MmMetodoPago } from "@arkiteq/db";
import { METODOS_PAGO_IDS } from "@/lib/minimarket/metodos-pago";

export type EstadoVentaPendiente = "activo" | "en_espera";

export interface VentaPendienteCarritoItem {
  productoId: string;
  cantidad: number;
  /** Precio ajustado puntual para esa venta (no toca el catálogo) — se
   * conserva al dejar en espera y al retomar. */
  precioAjustadoUsd?: number;
  motivoAjustePrecio?: string;
}

export interface VentaPendientePago {
  metodo: MmMetodoPago;
  monto: string;
  autoSaldo?: boolean;
  /** Cuenta bancaria elegida para este pago (pago móvil/transferencia/
   * tarjeta) — se conserva al dejar en espera y al retomar, si el método
   * sigue activo. Antes se perdía en el viaje de ida y vuelta y el pago
   * quedaba sin cuenta al confirmar la venta retomada. */
  cuentaBancariaId?: string;
}

export interface VentaPendienteInput {
  id: string;
  tenantId: string;
  sucursalId: string;
  usuarioId: string;
  clienteId: string | null;
  nota: string | null;
  carrito: VentaPendienteCarritoItem[];
  pagos: VentaPendientePago[];
  descuentoPct: string;
  descuentoMonto: string;
  tasaTipo: string;
  subtotalUsd: number;
  estado: EstadoVentaPendiente;
}

/** Fila tal como sale de una consulta SQL local (SQLite: todo texto/real). */
export interface VentaPendienteRow {
  id: string;
  tenant_id: string;
  sucursal_id: string;
  usuario_id: string | null;
  cliente_id: string | null;
  nota: string | null;
  carrito_json: string;
  pagos_json: string;
  descuento_pct: string;
  descuento_monto: string;
  tasa_tipo: string;
  subtotal_usd: number;
  articulos_count: number;
  estado: string;
  created_at: string;
  updated_at: string;
}

const carritoItemSchema = z.object({
  productoId: z.string().min(1),
  cantidad: z.number().positive(),
  precioAjustadoUsd: z.number().positive().optional(),
  motivoAjustePrecio: z.string().optional(),
});

const pagoItemSchema = z.object({
  metodo: z.enum(METODOS_PAGO_IDS),
  monto: z.string(),
  autoSaldo: z.boolean().optional(),
  cuentaBancariaId: z.string().uuid().optional(),
});

/** Parsea un array serializado con tolerancia: filas corruptas o de un formato
 * viejo se descartan en vez de tumbar el POS (es un borrador, no una venta). */
function parseArraySeguro<T>(raw: string, schema: z.ZodType<T>): T[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: T[] = [];
  for (const item of data) {
    const parsed = schema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export function parseCarritoPendiente(row: Pick<VentaPendienteRow, "carrito_json">) {
  return parseArraySeguro(row.carrito_json, carritoItemSchema);
}

export function parsePagosPendiente(row: Pick<VentaPendienteRow, "pagos_json">) {
  return parseArraySeguro(row.pagos_json, pagoItemSchema);
}

/** Crea o actualiza (por `id`) la fila de la venta en espera. */
export async function guardarVentaPendienteLocal(
  db: AbstractPowerSyncDatabase,
  input: VentaPendienteInput,
): Promise<void> {
  const nowIso = new Date().toISOString();
  const articulosCount = input.carrito.reduce((s, i) => s + i.cantidad, 0);
  const carritoJson = JSON.stringify(input.carrito);
  const pagosJson = JSON.stringify(input.pagos);

  const existente = await db.getOptional<{ id: string }>(
    `select id from mm_ventas_pendientes where id = ?`,
    [input.id],
  );

  if (existente) {
    await db.execute(
      `update mm_ventas_pendientes set
         cliente_id = ?, nota = ?, carrito_json = ?, pagos_json = ?,
         descuento_pct = ?, descuento_monto = ?, tasa_tipo = ?, subtotal_usd = ?,
         articulos_count = ?, estado = ?, updated_at = ?
       where id = ?`,
      [
        input.clienteId,
        input.nota,
        carritoJson,
        pagosJson,
        input.descuentoPct,
        input.descuentoMonto,
        input.tasaTipo,
        input.subtotalUsd,
        articulosCount,
        input.estado,
        nowIso,
        input.id,
      ],
    );
    return;
  }

  await db.execute(
    `insert into mm_ventas_pendientes
       (id, tenant_id, sucursal_id, usuario_id, cliente_id, nota, carrito_json, pagos_json,
        descuento_pct, descuento_monto, tasa_tipo, subtotal_usd, articulos_count, estado,
        created_at, updated_at)
     values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      input.id,
      input.tenantId,
      input.sucursalId,
      input.usuarioId,
      input.clienteId,
      input.nota,
      carritoJson,
      pagosJson,
      input.descuentoPct,
      input.descuentoMonto,
      input.tasaTipo,
      input.subtotalUsd,
      articulosCount,
      input.estado,
      nowIso,
      nowIso,
    ],
  );
}

/** Borrado físico: se llama al cancelar una pendiente o al confirmarla como venta real. */
export async function eliminarVentaPendienteLocal(
  db: AbstractPowerSyncDatabase,
  id: string,
): Promise<void> {
  await db.execute(`delete from mm_ventas_pendientes where id = ?`, [id]);
}

/** Lectura puntual (no reactiva) — se usa para restaurar el borrador activo al montar el POS. */
export async function obtenerVentaPendienteLocal(
  db: AbstractPowerSyncDatabase,
  id: string,
): Promise<VentaPendienteRow | null> {
  const row = await db.getOptional<VentaPendienteRow>(
    `select * from mm_ventas_pendientes where id = ?`,
    [id],
  );
  return row ?? null;
}
