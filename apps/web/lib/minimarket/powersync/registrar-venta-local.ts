/**
 * Registro de una venta ESCRITA DIRECTO EN LOCAL (SQLite/PowerSync), sin pasar
 * por el servidor. Es el camino que usa el POS cuando el dispositivo está sin
 * conexión (PLAN-SAAS-BODEGA.md §3 y §6.2.1: "vende igual, marca pendiente de
 * sync"). PowerSync encola cada INSERT y lo reproduce contra Supabase cuando
 * vuelve la señal (ver `powersync/connector.ts`).
 *
 * Cuando SÍ hay conexión se usa la server action `registrarVenta`, que revalida
 * precios y límite de crédito contra la base real — más segura. Este camino
 * local confía en los datos ya sincronizados al dispositivo (precios, tasa,
 * saldo del cliente) porque no hay servidor disponible para revalidar; es el
 * mismo trade-off que cualquier POS offline (Square, Loyverse, etc.).
 *
 * El folio se genera con prefijo "R-OFF-" (no correlativo) para no arriesgar
 * colisiones con el correlativo del servidor si dos dispositivos venden sin
 * conexión al mismo tiempo; es solo una etiqueta legible, no una clave.
 */
import type { AbstractPowerSyncDatabase } from "@powersync/web";
import type { MmMetodoPago } from "@arkiteq/db";

export interface VentaLocalItem {
  productoId: string;
  descripcion: string;
  cantidad: number;
  /** Ya resuelto por el caller: el ajustado si aplica, si no el de catálogo
   * (offline no hay servidor para revalidar el permiso — mismo trade-off que
   * el resto de este archivo, documentado arriba). */
  precioUsd: number;
  impuestoId: string;
  precioAjustado?: boolean;
  motivoAjustePrecio?: string | null;
  /** Si esta línea causa IGTF al pagarse en divisa — ya resuelto por el
   * caller (estado del producto o su override puntual en esta venta). */
  aplicaIgtf: boolean;
}

export interface VentaLocalPago {
  metodo: MmMetodoPago;
  monto: number;
  moneda: "USD" | "VES";
}

export interface VentaLocalInput {
  tenantId: string;
  usuarioId: string;
  sucursalId: string;
  clienteId: string | null;
  items: VentaLocalItem[];
  pagos: VentaLocalPago[];
  tasa: number;
  /** Subtotal neto (post-descuento, pre-impuestos), igual a `subtotalNeto` del POS. */
  subtotalUsd: number;
  descuentoUsd: number;
  igtfUsd: number;
  totalUsd: number;
  totalBs: number;
  /** Monto fiado real de esta venta (0 si no hay fiado). */
  fiadoMonto: number;
  /**
   * Vuelto REAL en efectivo entregado al cliente (moneda elegida por el
   * cajero). Se registra como egreso de caja para que el efectivo neto sea el
   * correcto — mismo motivo que en la server action `registrarVenta`.
   */
  vuelto?: { monto: number; moneda: "USD" | "VES" };
}

export interface VentaLocalResultado {
  ventaId: string;
  numeroDocumento: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function generarFolioOffline(): string {
  return `R-OFF-${Date.now().toString(36).toUpperCase()}`;
}

export async function registrarVentaLocal(
  db: AbstractPowerSyncDatabase,
  input: VentaLocalInput,
): Promise<VentaLocalResultado> {
  const nowIso = new Date().toISOString();
  const ventaId = crypto.randomUUID();
  const numeroDocumento = generarFolioOffline();

  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `insert into mm_ventas
         (id, tenant_id, sucursal_id, usuario_id, cliente_id, fecha, tasa_usada,
          subtotal_usd, descuento_usd, igtf_usd, total_usd, total_bs,
          tipo_documento, numero_documento, estado, created_at, updated_at)
       values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        ventaId,
        input.tenantId,
        input.sucursalId,
        input.usuarioId,
        input.clienteId,
        nowIso,
        input.tasa,
        input.subtotalUsd,
        input.descuentoUsd,
        input.igtfUsd,
        input.totalUsd,
        input.totalBs,
        "recibo",
        numeroDocumento,
        "completada",
        nowIso,
        nowIso,
      ],
    );

    for (const item of input.items) {
      await tx.execute(
        `insert into mm_ventas_items
           (id, tenant_id, venta_id, producto_id, descripcion, cantidad, precio_usd,
            impuesto_id, total_usd, precio_ajustado, motivo_ajuste_precio, aplica_igtf, created_at)
         values (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          crypto.randomUUID(),
          input.tenantId,
          ventaId,
          item.productoId,
          item.descripcion,
          item.cantidad,
          item.precioUsd,
          item.impuestoId,
          round2(item.precioUsd * item.cantidad),
          item.precioAjustado ? 1 : 0,
          item.motivoAjustePrecio ?? null,
          item.aplicaIgtf ? 1 : 0,
          nowIso,
        ],
      );

      await tx.execute(
        `insert into mm_movimientos_inventario
           (id, tenant_id, producto_id, sucursal_id, tipo, cantidad, motivo, referencia,
            usuario_id, created_at)
         values (?,?,?,?,?,?,?,?,?,?)`,
        [
          crypto.randomUUID(),
          input.tenantId,
          item.productoId,
          input.sucursalId,
          "salida",
          -Math.abs(item.cantidad),
          "Venta",
          ventaId,
          input.usuarioId,
          nowIso,
        ],
      );
    }

    for (const pago of input.pagos) {
      await tx.execute(
        `insert into mm_pagos_venta
           (id, tenant_id, venta_id, metodo, monto, moneda, tasa_usada, created_at)
         values (?,?,?,?,?,?,?,?)`,
        [
          crypto.randomUUID(),
          input.tenantId,
          ventaId,
          pago.metodo,
          pago.monto,
          pago.moneda,
          input.tasa,
          nowIso,
        ],
      );
    }

    const pagosEfectivo = input.pagos.filter(
      (p) => p.metodo === "efectivo_bs" || p.metodo === "efectivo_usd",
    );
    if (pagosEfectivo.length > 0 || input.vuelto) {
      const sesion = await tx.getOptional<{ id: string }>(
        `select id from mm_caja_sesiones
           where tenant_id = ? and sucursal_id = ? and estado = 'abierta' and deleted_at is null
           order by abierta_en desc limit 1`,
        [input.tenantId, input.sucursalId],
      );
      if (sesion) {
        for (const pago of pagosEfectivo) {
          await tx.execute(
            `insert into mm_caja_movimientos
               (id, tenant_id, sesion_id, tipo, monto, moneda, motivo, referencia, usuario_id, created_at)
             values (?,?,?,?,?,?,?,?,?,?)`,
            [
              crypto.randomUUID(),
              input.tenantId,
              sesion.id,
              "venta",
              pago.monto,
              pago.moneda,
              `Venta ${numeroDocumento}`,
              ventaId,
              input.usuarioId,
              nowIso,
            ],
          );
        }
        // Vuelto real entregado en efectivo: egreso, para que el efectivo neto
        // en la gaveta sea el correcto (mismo motivo que en `registrarVenta`).
        if (input.vuelto && input.vuelto.monto > 0.001) {
          await tx.execute(
            `insert into mm_caja_movimientos
               (id, tenant_id, sesion_id, tipo, monto, moneda, motivo, referencia, usuario_id, created_at)
             values (?,?,?,?,?,?,?,?,?,?)`,
            [
              crypto.randomUUID(),
              input.tenantId,
              sesion.id,
              "egreso",
              input.vuelto.monto,
              input.vuelto.moneda,
              `Vuelto venta ${numeroDocumento}`,
              ventaId,
              input.usuarioId,
              nowIso,
            ],
          );
        }
      }
    }

    if (input.clienteId && input.fiadoMonto > 0.001) {
      await tx.execute(
        `insert into mm_fiados
           (id, tenant_id, cliente_id, venta_id, monto_usd, estado, created_at, updated_at)
         values (?,?,?,?,?,?,?,?)`,
        [
          crypto.randomUUID(),
          input.tenantId,
          input.clienteId,
          ventaId,
          round2(input.fiadoMonto),
          "abierto",
          nowIso,
          nowIso,
        ],
      );
    }
  });

  return { ventaId, numeroDocumento };
}
