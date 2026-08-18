/**
 * Clientes y abonos de fiado ESCRITOS DIRECTO EN LOCAL (SQLite/PowerSync), sin
 * pasar por el servidor. Mismo patrón que `registrar-venta-local.ts`.
 *
 * El abono replica la distribución FIFO de `clientes/actions.ts` (`registrarAbono`):
 * se reparte entre los fiados abiertos del cliente, del más antiguo al más
 * reciente, prorrateando el IGTF, y marca cada fiado como "pagado" cuando sus
 * propios abonos alcanzan su monto — el saldo del cliente sigue siendo 100%
 * derivado del ledger (nunca un contador editable), tanto en Postgres
 * (`mm_v_saldo_cliente`) como aquí en SQLite local.
 */
import type { AbstractPowerSyncDatabase } from "@powersync/web";
import type { MmMetodoPago } from "@arkiteq/db";

export interface ClienteLocalInput {
  tenantId: string;
  nombre: string;
  cedula: string | null;
  telefono: string | null;
  whatsapp: string | null;
  direccion: string | null;
  limiteFiadoUsd: number;
  notas: string | null;
  activo: boolean;
}

export async function crearClienteLocal(
  db: AbstractPowerSyncDatabase,
  input: ClienteLocalInput,
): Promise<{ clienteId: string }> {
  const nowIso = new Date().toISOString();
  const clienteId = crypto.randomUUID();

  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `insert into mm_clientes
         (id, tenant_id, nombre, cedula, telefono, whatsapp, direccion, limite_fiado_usd, notas,
          activo, created_at, updated_at)
       values (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        clienteId,
        input.tenantId,
        input.nombre,
        input.cedula,
        input.telefono,
        input.whatsapp,
        input.direccion,
        input.limiteFiadoUsd,
        input.notas,
        input.activo ? 1 : 0,
        nowIso,
        nowIso,
      ],
    );
  });

  return { clienteId };
}

export async function actualizarClienteLocal(
  db: AbstractPowerSyncDatabase,
  clienteId: string,
  input: ClienteLocalInput,
): Promise<void> {
  const nowIso = new Date().toISOString();
  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `update mm_clientes set
         nombre = ?, cedula = ?, telefono = ?, whatsapp = ?, direccion = ?, limite_fiado_usd = ?,
         notas = ?, activo = ?, updated_at = ?
       where tenant_id = ? and id = ?`,
      [
        input.nombre,
        input.cedula,
        input.telefono,
        input.whatsapp,
        input.direccion,
        input.limiteFiadoUsd,
        input.notas,
        input.activo ? 1 : 0,
        nowIso,
        input.tenantId,
        clienteId,
      ],
    );
  });
}

/** Replica `mm_v_saldo_cliente` (Postgres) sobre las tablas locales. */
export async function obtenerSaldoClienteLocal(
  db: AbstractPowerSyncDatabase,
  tenantId: string,
  clienteId: string,
): Promise<number> {
  const fila = await db.getOptional<{ saldo: number }>(
    `select
       coalesce((select sum(monto_usd) from mm_fiados
                  where tenant_id = ? and cliente_id = ? and estado <> 'anulado' and deleted_at is null), 0)
       -
       coalesce((select sum(monto_usd) from mm_abonos_fiado
                  where tenant_id = ? and cliente_id = ?), 0) as saldo`,
    [tenantId, clienteId, tenantId, clienteId],
  );
  return fila?.saldo ?? 0;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface AbonoLocalInput {
  tenantId: string;
  usuarioId: string;
  sucursalId: string;
  clienteId: string;
  /** Solo para el motivo del movimiento de caja ("Abono — {nombre}"). */
  clienteNombre: string;
  montoUsd: number;
  metodo: MmMetodoPago;
  igtfUsd: number;
  tasa: number;
}

function esEfectivoLocal(metodo: MmMetodoPago): boolean {
  return metodo === "efectivo_bs" || metodo === "efectivo_usd";
}

export interface AbonoLocalResultado {
  abonoIds: string[];
}

export async function registrarAbonoLocal(
  db: AbstractPowerSyncDatabase,
  input: AbonoLocalInput,
): Promise<AbonoLocalResultado> {
  const nowIso = new Date().toISOString();
  const abonoIds: string[] = [];

  await db.writeTransaction(async (tx) => {
    const fiadosAbiertos = await tx.getAll<{ id: string; monto_usd: number }>(
      `select id, monto_usd from mm_fiados
         where tenant_id = ? and cliente_id = ? and estado = 'abierto' and deleted_at is null
         order by created_at asc`,
      [input.tenantId, input.clienteId],
    );

    let restante = input.montoUsd;

    for (const fiado of fiadosAbiertos) {
      if (restante <= 0) break;

      const abonosDelFiado = await tx.getAll<{ monto_usd: number }>(
        `select monto_usd from mm_abonos_fiado where fiado_id = ?`,
        [fiado.id],
      );
      const yaAbonado = abonosDelFiado.reduce((s, a) => s + Number(a.monto_usd), 0);
      const pendienteFiado = Math.max(0, Number(fiado.monto_usd) - yaAbonado);
      if (pendienteFiado <= 0) continue;

      const porcion = round2(Math.min(restante, pendienteFiado));
      restante = round2(restante - porcion);

      const proporcion = porcion / input.montoUsd;
      const igtfPorcion = round2(input.igtfUsd * proporcion);
      const bsPorcion = round2(porcion * input.tasa);

      const abonoId = crypto.randomUUID();
      await tx.execute(
        `insert into mm_abonos_fiado
           (id, tenant_id, fiado_id, cliente_id, monto_usd, monto_bs, igtf_usd, tasa_usada, metodo,
            usuario_id, created_at)
         values (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          abonoId,
          input.tenantId,
          fiado.id,
          input.clienteId,
          porcion,
          bsPorcion,
          igtfPorcion,
          input.tasa,
          input.metodo,
          input.usuarioId,
          nowIso,
        ],
      );
      abonoIds.push(abonoId);

      const totalAbonado = yaAbonado + porcion;
      if (totalAbonado >= Number(fiado.monto_usd) - 0.001) {
        await tx.execute(`update mm_fiados set estado = 'pagado', updated_at = ? where id = ?`, [
          nowIso,
          fiado.id,
        ]);
      }
    }

    // Ingreso a Caja — mismo alcance que `registrar-venta-local.ts`: solo
    // efectivo (Bs/USD), UNA vez por abono (no por línea FIFO), y solo si hay
    // una sesión de caja abierta en este dispositivo. Métodos con cuenta
    // bancaria (pago móvil/transferencia/Zelle/tarjeta) no se registran sin
    // conexión — no hay forma de elegir la cuenta offline, mismo criterio que
    // ya acepta el registro de ventas offline.
    if (esEfectivoLocal(input.metodo) && abonoIds.length > 0) {
      const sesion = await tx.getOptional<{ id: string }>(
        `select id from mm_caja_sesiones
           where tenant_id = ? and sucursal_id = ? and estado = 'abierta' and deleted_at is null
           order by abierta_en desc limit 1`,
        [input.tenantId, input.sucursalId],
      );
      if (sesion) {
        const montoRecibidoUsd = round2(input.montoUsd + input.igtfUsd);
        const montoRecibidoBs = round2(montoRecibidoUsd * input.tasa);
        await tx.execute(
          `insert into mm_caja_movimientos
             (id, tenant_id, sesion_id, tipo, monto, moneda, motivo, referencia, usuario_id, created_at)
           values (?,?,?,?,?,?,?,?,?,?)`,
          [
            crypto.randomUUID(),
            input.tenantId,
            sesion.id,
            "ingreso",
            input.metodo === "efectivo_usd" ? montoRecibidoUsd : montoRecibidoBs,
            input.metodo === "efectivo_usd" ? "USD" : "VES",
            `Abono — ${input.clienteNombre}`,
            abonoIds[0],
            input.usuarioId,
            nowIso,
          ],
        );
      }
    }
  });

  return { abonoIds };
}
