/**
 * Transferencia de stock entre sucursales ESCRITA DIRECTO EN LOCAL
 * (SQLite/PowerSync), sin pasar por el servidor. Mismo patrón que
 * `registrar-compra-local.ts`/`registrarMovimientoInventarioLocal`: valida
 * stock suficiente en origen dentro de la misma transacción y escribe el
 * movimiento (salida + entrada) antes que el documento (cabecera + ítems),
 * igual criterio que el camino online (`registrarTransferencia`).
 */
import type { AbstractPowerSyncDatabase, Transaction } from "@powersync/web";
import { deltaConSigno } from "@/lib/minimarket/inventario-calc";

export interface TransferenciaItemLocalInput {
  productoId: string;
  cantidad: number;
}

export interface TransferenciaLocalInput {
  tenantId: string;
  usuarioId: string;
  sucursalOrigenId: string;
  sucursalDestinoId: string;
  notas: string | null;
  items: TransferenciaItemLocalInput[];
}

/** Stock local de un producto en una sucursal: misma suma que la vista `mm_v_stock` del servidor. */
async function stockLocal(
  tx: Transaction,
  tenantId: string,
  productoId: string,
  sucursalId: string,
): Promise<number> {
  const row = await tx.getOptional<{ stock: number | null }>(
    `select coalesce(sum(cantidad), 0) as stock from mm_movimientos_inventario
     where tenant_id = ? and producto_id = ? and sucursal_id = ?`,
    [tenantId, productoId, sucursalId],
  );
  return Number(row?.stock ?? 0);
}

export async function registrarTransferenciaLocal(
  db: AbstractPowerSyncDatabase,
  input: TransferenciaLocalInput,
): Promise<{ transferenciaId: string }> {
  if (input.sucursalOrigenId === input.sucursalDestinoId) {
    throw new Error("La sucursal de origen y de destino deben ser distintas.");
  }
  if (input.items.length === 0) {
    throw new Error("Agrega al menos un producto.");
  }

  const nowIso = new Date().toISOString();
  const transferenciaId = crypto.randomUUID();

  // Consolida productos repetidos, igual que el camino online.
  const cantidadPorProducto = new Map<string, number>();
  for (const item of input.items) {
    cantidadPorProducto.set(
      item.productoId,
      (cantidadPorProducto.get(item.productoId) ?? 0) + item.cantidad,
    );
  }

  await db.writeTransaction(async (tx) => {
    for (const [productoId, cantidad] of cantidadPorProducto) {
      const disponible = await stockLocal(tx, input.tenantId, productoId, input.sucursalOrigenId);
      if (cantidad > disponible) {
        throw new Error(
          `Stock insuficiente: disponible ${disponible}, solicitado ${cantidad} de un producto.`,
        );
      }
    }

    for (const [productoId, cantidad] of cantidadPorProducto) {
      await tx.execute(
        `insert into mm_movimientos_inventario
           (id, tenant_id, producto_id, sucursal_id, tipo, cantidad, motivo, referencia, usuario_id, created_at)
         values (?,?,?,?,?,?,?,?,?,?)`,
        [
          crypto.randomUUID(),
          input.tenantId,
          productoId,
          input.sucursalOrigenId,
          "salida",
          deltaConSigno("salida", cantidad),
          "Transferencia entre sucursales",
          transferenciaId,
          input.usuarioId,
          nowIso,
        ],
      );
      await tx.execute(
        `insert into mm_movimientos_inventario
           (id, tenant_id, producto_id, sucursal_id, tipo, cantidad, motivo, referencia, usuario_id, created_at)
         values (?,?,?,?,?,?,?,?,?,?)`,
        [
          crypto.randomUUID(),
          input.tenantId,
          productoId,
          input.sucursalDestinoId,
          "entrada",
          deltaConSigno("entrada", cantidad),
          "Transferencia entre sucursales",
          transferenciaId,
          input.usuarioId,
          nowIso,
        ],
      );
    }

    await tx.execute(
      `insert into mm_transferencias
         (id, tenant_id, sucursal_origen_id, sucursal_destino_id, usuario_id, notas, created_at)
       values (?,?,?,?,?,?,?)`,
      [
        transferenciaId,
        input.tenantId,
        input.sucursalOrigenId,
        input.sucursalDestinoId,
        input.usuarioId,
        input.notas,
        nowIso,
      ],
    );

    for (const [productoId, cantidad] of cantidadPorProducto) {
      await tx.execute(
        `insert into mm_transferencias_items (id, tenant_id, transferencia_id, producto_id, cantidad, created_at)
         values (?,?,?,?,?,?)`,
        [crypto.randomUUID(), input.tenantId, transferenciaId, productoId, cantidad, nowIso],
      );
    }
  });

  return { transferenciaId };
}
