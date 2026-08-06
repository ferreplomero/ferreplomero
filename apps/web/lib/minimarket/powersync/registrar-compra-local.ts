/**
 * Proveedores y compras ESCRITOS DIRECTO EN LOCAL (SQLite/PowerSync), sin pasar
 * por el servidor. Mismo patrón que `registrar-venta-local.ts`.
 *
 * A diferencia del camino online (`compras/actions.ts`), aquí la recepción de
 * stock/costo corre DENTRO de la misma `writeTransaction` que la compra y sus
 * ítems — más atómico que el original (que hace los updates de costo en
 * `Promise.all` sin revisar errores individualmente).
 */
import type { AbstractPowerSyncDatabase } from "@powersync/web";
import { margenSobreCosto, precioDesdeMargen } from "@/lib/minimarket/producto-opciones";

export interface ProveedorLocalInput {
  tenantId: string;
  nombre: string;
  contacto: string | null;
  telefono: string | null;
  whatsapp: string | null;
  notas: string | null;
  activo: boolean;
}

export async function crearProveedorLocal(
  db: AbstractPowerSyncDatabase,
  input: ProveedorLocalInput,
): Promise<{ proveedorId: string }> {
  const nowIso = new Date().toISOString();
  const proveedorId = crypto.randomUUID();

  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `insert into mm_proveedores
         (id, tenant_id, nombre, contacto, telefono, whatsapp, notas, activo, created_at, updated_at)
       values (?,?,?,?,?,?,?,?,?,?)`,
      [
        proveedorId,
        input.tenantId,
        input.nombre,
        input.contacto,
        input.telefono,
        input.whatsapp,
        input.notas,
        input.activo ? 1 : 0,
        nowIso,
        nowIso,
      ],
    );
  });

  return { proveedorId };
}

export async function actualizarProveedorLocal(
  db: AbstractPowerSyncDatabase,
  proveedorId: string,
  input: ProveedorLocalInput,
): Promise<void> {
  const nowIso = new Date().toISOString();
  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `update mm_proveedores set
         nombre = ?, contacto = ?, telefono = ?, whatsapp = ?, notas = ?, activo = ?, updated_at = ?
       where tenant_id = ? and id = ?`,
      [
        input.nombre,
        input.contacto,
        input.telefono,
        input.whatsapp,
        input.notas,
        input.activo ? 1 : 0,
        nowIso,
        input.tenantId,
        proveedorId,
      ],
    );
  });
}

export interface CompraItemLocalInput {
  productoId: string;
  cantidad: number;
  costoUnitarioUsd: number;
  /** Decisión del usuario cuando el costo cambió respecto al inventario:
   * actualizar costo/precio de venta del producto (true) o mantenerlos y que
   * esta compra solo registre su costo real pagado (false, default). */
  actualizarCosto: boolean;
}

export interface CompraLocalInput {
  tenantId: string;
  usuarioId: string;
  proveedorId: string | null;
  sucursalId: string;
  fecha: string;
  estado: "borrador" | "recibida";
  notas: string | null;
  items: CompraItemLocalInput[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function registrarCompraLocal(
  db: AbstractPowerSyncDatabase,
  input: CompraLocalInput,
): Promise<{ compraId: string }> {
  const nowIso = new Date().toISOString();
  const compraId = crypto.randomUUID();
  const totalUsd = round2(input.items.reduce((s, i) => s + i.cantidad * i.costoUnitarioUsd, 0));

  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `insert into mm_compras
         (id, tenant_id, proveedor_id, sucursal_id, fecha, total_usd, estado, notas, usuario_id,
          created_at, updated_at)
       values (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        compraId,
        input.tenantId,
        input.proveedorId,
        input.sucursalId,
        input.fecha,
        totalUsd,
        input.estado,
        input.notas,
        input.usuarioId,
        nowIso,
        nowIso,
      ],
    );

    for (const item of input.items) {
      await tx.execute(
        `insert into mm_compras_items
           (id, tenant_id, compra_id, producto_id, cantidad, costo_unitario_usd, actualizar_costo, created_at, updated_at)
         values (?,?,?,?,?,?,?,?,?)`,
        [
          crypto.randomUUID(),
          input.tenantId,
          compraId,
          item.productoId,
          item.cantidad,
          item.costoUnitarioUsd,
          item.actualizarCosto ? 1 : 0,
          nowIso,
          nowIso,
        ],
      );
    }

    if (input.estado === "recibida") {
      for (const item of input.items) {
        // El stock SIEMPRE sube por la cantidad comprada, sin excepción,
        // pase lo que pase con la decisión de costo (mismo criterio que el
        // camino online en compras/actions.ts::aplicarRecepcion).
        await tx.execute(
          `insert into mm_movimientos_inventario
             (id, tenant_id, producto_id, sucursal_id, tipo, cantidad, motivo, referencia, usuario_id, created_at)
           values (?,?,?,?,?,?,?,?,?,?)`,
          [
            crypto.randomUUID(),
            input.tenantId,
            item.productoId,
            input.sucursalId,
            "entrada",
            item.cantidad,
            "Compra",
            compraId,
            input.usuarioId,
            nowIso,
          ],
        );

        if (!item.actualizarCosto) continue;

        // Costo/precio actuales de verdad, releídos justo antes de decidir —
        // mismo criterio que el camino online (nunca confiar en un valor
        // capturado antes en el formulario).
        const actual = await tx.getOptional<{ costo_usd: number; precio_usd: number }>(
          `select costo_usd, precio_usd from mm_productos where tenant_id = ? and id = ?`,
          [input.tenantId, item.productoId],
        );
        if (!actual) continue;

        const huboCambioReal = Math.abs(actual.costo_usd - item.costoUnitarioUsd) > 0.001;
        if (!huboCambioReal) continue;

        const margen = margenSobreCosto(actual.costo_usd, actual.precio_usd);
        const nuevoPrecio =
          margen !== null ? precioDesdeMargen(item.costoUnitarioUsd, margen) : actual.precio_usd;

        await tx.execute(
          `update mm_productos set costo_usd = ?, precio_usd = ?, updated_at = ? where id = ?`,
          [item.costoUnitarioUsd, nuevoPrecio, nowIso, item.productoId],
        );
        await tx.execute(
          `insert into mm_precios (id, tenant_id, producto_id, precio_usd, vigente_desde, usuario_id, created_at)
           values (?,?,?,?,?,?,?)`,
          [
            crypto.randomUUID(),
            input.tenantId,
            item.productoId,
            item.costoUnitarioUsd,
            nowIso,
            input.usuarioId,
            nowIso,
          ],
        );
      }
    }
  });

  return { compraId };
}
