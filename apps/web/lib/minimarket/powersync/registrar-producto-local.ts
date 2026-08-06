/**
 * Crear/editar producto y categorías ESCRITO DIRECTO EN LOCAL (SQLite/PowerSync),
 * sin pasar por el servidor. Mismo patrón que `registrar-venta-local.ts`: cada
 * INSERT/UPDATE se encola y PowerSync lo reproduce contra Supabase cuando vuelve
 * la señal (ver `powersync/connector.ts`).
 *
 * Trade-off asumido (igual que ventas): no se valida unicidad de código/código
 * de barras contra el servidor (SQLite local no impone esa constraint) — si dos
 * dispositivos crean el mismo código sin conexión, el conflicto se resuelve al
 * sincronizar (Supabase sí lo rechazará con 23505 en la subida de uno de los dos).
 * Tampoco hay validación de stock negativo: el sistema no la tiene ni siquiera
 * online (ver `inventario/actions.ts`).
 */
import type { AbstractPowerSyncDatabase, Transaction } from "@powersync/web";
import { deltaConSigno, type TipoMovimientoInventario } from "@/lib/minimarket/inventario-calc";

export interface ProductoLocalInput {
  tenantId: string;
  usuarioId: string;
  sucursalId: string | null;
  nombre: string;
  codigo: string | null;
  categoriaId: string | null;
  tipoVenta: "unidad" | "granel";
  unidad: string;
  costoUsd: number;
  precioUsd: number;
  impuestoId: string;
  aplicaIgtf: boolean;
  proveedorId: string | null;
  etiquetas: string[];
  codigos: string[];
  activo: boolean;
  /** Si el precio de venta sigue el margen de ganancia global del negocio. */
  usaMargenGlobal: boolean;
  stockMinimo?: number;
  /** Solo se usa al crear. */
  stockInicial?: number;
}

async function sincronizarCodigosLocal(
  tx: Transaction,
  tenantId: string,
  productoId: string,
  codigos: string[],
  nowIso: string,
): Promise<void> {
  const existentes = await tx.getAll<{ id: string; codigo: string }>(
    `select id, codigo from mm_producto_codigos where tenant_id = ? and producto_id = ?`,
    [tenantId, productoId],
  );
  const actuales = new Map(existentes.map((c) => [c.codigo, c.id]));
  const deseados = new Set(codigos);

  for (const existente of existentes) {
    if (!deseados.has(existente.codigo)) {
      await tx.execute(`delete from mm_producto_codigos where id = ?`, [existente.id]);
    }
  }
  for (const codigo of codigos) {
    if (!actuales.has(codigo)) {
      await tx.execute(
        `insert into mm_producto_codigos (id, tenant_id, producto_id, codigo, created_at)
         values (?,?,?,?,?)`,
        [crypto.randomUUID(), tenantId, productoId, codigo, nowIso],
      );
    }
  }
}

async function aplicarStockMinimoLocal(
  tx: Transaction,
  tenantId: string,
  productoId: string,
  sucursalId: string,
  stockMinimo: number,
  nowIso: string,
): Promise<void> {
  const existente = await tx.getOptional<{ id: string }>(
    `select id from mm_inventario where tenant_id = ? and producto_id = ? and sucursal_id = ?`,
    [tenantId, productoId, sucursalId],
  );
  if (existente) {
    await tx.execute(`update mm_inventario set stock_minimo = ?, updated_at = ? where id = ?`, [
      stockMinimo,
      nowIso,
      existente.id,
    ]);
  } else {
    await tx.execute(
      `insert into mm_inventario
         (id, tenant_id, producto_id, sucursal_id, stock_minimo, created_at, updated_at)
       values (?,?,?,?,?,?,?)`,
      [crypto.randomUUID(), tenantId, productoId, sucursalId, stockMinimo, nowIso, nowIso],
    );
  }
}

export async function crearProductoLocal(
  db: AbstractPowerSyncDatabase,
  input: ProductoLocalInput,
): Promise<{ productoId: string }> {
  const nowIso = new Date().toISOString();
  const productoId = crypto.randomUUID();

  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `insert into mm_productos
         (id, tenant_id, nombre, codigo, codigo_barras, categoria_id, tipo_venta, unidad,
          costo_usd, precio_usd, impuesto_id, aplica_igtf, proveedor_id, etiquetas, activo,
          usa_margen_global, created_at, updated_at)
       values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        productoId,
        input.tenantId,
        input.nombre,
        input.codigo,
        input.codigos[0] ?? null,
        input.categoriaId,
        input.tipoVenta,
        input.unidad,
        input.costoUsd,
        input.precioUsd,
        input.impuestoId,
        input.aplicaIgtf ? 1 : 0,
        input.proveedorId,
        JSON.stringify(input.etiquetas),
        input.activo ? 1 : 0,
        input.usaMargenGlobal ? 1 : 0,
        nowIso,
        nowIso,
      ],
    );

    if (input.codigos.length > 0) {
      await sincronizarCodigosLocal(tx, input.tenantId, productoId, input.codigos, nowIso);
    }

    await tx.execute(
      `insert into mm_precios (id, tenant_id, producto_id, precio_usd, vigente_desde, usuario_id, created_at)
       values (?,?,?,?,?,?,?)`,
      [
        crypto.randomUUID(),
        input.tenantId,
        productoId,
        input.precioUsd,
        nowIso,
        input.usuarioId,
        nowIso,
      ],
    );

    if (input.sucursalId) {
      if (input.stockMinimo !== undefined) {
        await aplicarStockMinimoLocal(
          tx,
          input.tenantId,
          productoId,
          input.sucursalId,
          input.stockMinimo,
          nowIso,
        );
      }
      if (input.stockInicial !== undefined && input.stockInicial > 0) {
        await tx.execute(
          `insert into mm_movimientos_inventario
             (id, tenant_id, producto_id, sucursal_id, tipo, cantidad, motivo, usuario_id, created_at)
           values (?,?,?,?,?,?,?,?,?)`,
          [
            crypto.randomUUID(),
            input.tenantId,
            productoId,
            input.sucursalId,
            "entrada",
            input.stockInicial,
            "Stock inicial",
            input.usuarioId,
            nowIso,
          ],
        );
      }
    }
  });

  return { productoId };
}

export async function actualizarProductoLocal(
  db: AbstractPowerSyncDatabase,
  productoId: string,
  input: ProductoLocalInput,
): Promise<void> {
  const nowIso = new Date().toISOString();

  await db.writeTransaction(async (tx) => {
    const previo = await tx.getOptional<{ precio_usd: number }>(
      `select precio_usd from mm_productos where tenant_id = ? and id = ?`,
      [input.tenantId, productoId],
    );

    await tx.execute(
      `update mm_productos set
         nombre = ?, codigo = ?, codigo_barras = ?, categoria_id = ?, tipo_venta = ?, unidad = ?,
         costo_usd = ?, precio_usd = ?, impuesto_id = ?, aplica_igtf = ?, proveedor_id = ?,
         etiquetas = ?, activo = ?, usa_margen_global = ?, updated_at = ?
       where tenant_id = ? and id = ?`,
      [
        input.nombre,
        input.codigo,
        input.codigos[0] ?? null,
        input.categoriaId,
        input.tipoVenta,
        input.unidad,
        input.costoUsd,
        input.precioUsd,
        input.impuestoId,
        input.aplicaIgtf ? 1 : 0,
        input.proveedorId,
        JSON.stringify(input.etiquetas),
        input.activo ? 1 : 0,
        input.usaMargenGlobal ? 1 : 0,
        nowIso,
        input.tenantId,
        productoId,
      ],
    );

    await sincronizarCodigosLocal(tx, input.tenantId, productoId, input.codigos, nowIso);

    if (previo && Number(previo.precio_usd) !== input.precioUsd) {
      await tx.execute(
        `insert into mm_precios (id, tenant_id, producto_id, precio_usd, vigente_desde, usuario_id, created_at)
         values (?,?,?,?,?,?,?)`,
        [
          crypto.randomUUID(),
          input.tenantId,
          productoId,
          input.precioUsd,
          nowIso,
          input.usuarioId,
          nowIso,
        ],
      );
    }

    if (input.stockMinimo !== undefined && input.sucursalId) {
      await aplicarStockMinimoLocal(
        tx,
        input.tenantId,
        productoId,
        input.sucursalId,
        input.stockMinimo,
        nowIso,
      );
    }
  });
}

export interface MovimientoInventarioLocalInput {
  tenantId: string;
  usuarioId: string;
  sucursalId: string;
  productoId: string;
  tipo: TipoMovimientoInventario;
  cantidad: number;
  motivo?: string | null;
}

/** Registra un movimiento en el ledger append-only (mueve el stock derivado). */
export async function registrarMovimientoInventarioLocal(
  db: AbstractPowerSyncDatabase,
  input: MovimientoInventarioLocalInput,
): Promise<void> {
  const nowIso = new Date().toISOString();
  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `insert into mm_movimientos_inventario
         (id, tenant_id, producto_id, sucursal_id, tipo, cantidad, motivo, usuario_id, created_at)
       values (?,?,?,?,?,?,?,?,?)`,
      [
        crypto.randomUUID(),
        input.tenantId,
        input.productoId,
        input.sucursalId,
        input.tipo,
        deltaConSigno(input.tipo, input.cantidad),
        input.motivo ?? null,
        input.usuarioId,
        nowIso,
      ],
    );
  });
}

export interface CategoriaLocalInput {
  tenantId: string;
  nombre: string;
}

export async function crearCategoriaLocal(
  db: AbstractPowerSyncDatabase,
  input: CategoriaLocalInput,
): Promise<{ categoriaId: string }> {
  const nowIso = new Date().toISOString();
  const categoriaId = crypto.randomUUID();

  await db.writeTransaction(async (tx) => {
    const conteo = await tx.getOptional<{ n: number }>(
      `select count(*) as n from mm_categorias where tenant_id = ? and deleted_at is null`,
      [input.tenantId],
    );
    await tx.execute(
      `insert into mm_categorias (id, tenant_id, nombre, orden, created_at, updated_at)
       values (?,?,?,?,?,?)`,
      [categoriaId, input.tenantId, input.nombre, conteo?.n ?? 0, nowIso, nowIso],
    );
  });

  return { categoriaId };
}

export async function actualizarCategoriaLocal(
  db: AbstractPowerSyncDatabase,
  categoriaId: string,
  input: CategoriaLocalInput,
): Promise<void> {
  const nowIso = new Date().toISOString();
  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `update mm_categorias set nombre = ?, updated_at = ? where tenant_id = ? and id = ?`,
      [input.nombre, nowIso, input.tenantId, categoriaId],
    );
  });
}

/** Replica `mm_v_stock` (Postgres) sobre el ledger local: SUM(cantidad) por producto/sucursal. */
export async function obtenerStockLocal(
  db: AbstractPowerSyncDatabase,
  tenantId: string,
  productoId: string,
): Promise<number> {
  const fila = await db.getOptional<{ stock: number }>(
    `select coalesce(sum(cantidad), 0) as stock
       from mm_movimientos_inventario
      where tenant_id = ? and producto_id = ?`,
    [tenantId, productoId],
  );
  return fila?.stock ?? 0;
}
