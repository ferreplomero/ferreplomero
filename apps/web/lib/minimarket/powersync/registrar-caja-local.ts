/**
 * Caja (abrir turno, movimientos, cierre/arqueo) y tasa manual ESCRITOS DIRECTO
 * EN LOCAL (SQLite/PowerSync), sin pasar por el servidor. Mismo patrón que
 * `registrar-venta-local.ts`.
 *
 * Trade-off asumido para `abrirCajaLocal`: al igual que el resto del camino
 * offline, no hay forma de que el dispositivo sepa si OTRO dispositivo ya
 * abrió una caja sin sincronizar todavía — la regla "una sola caja abierta"
 * (comprobada aquí solo contra el ledger LOCAL) puede quedar temporalmente
 * inconsistente entre dispositivos hasta que ambos sincronicen. Igual que
 * ventas/fiado offline, se prioriza que el negocio nunca se detenga.
 */
import type { AbstractPowerSyncDatabase } from "@powersync/web";
import type { MmCajaMovTipo, MmTipoTasa } from "@arkiteq/db";

export interface AbrirCajaLocalInput {
  tenantId: string;
  usuarioId: string;
  sucursalId: string;
  montoInicialUsd: number;
  montoInicialBs: number;
}

export interface AbrirCajaLocalResultado {
  sesionId: string;
}

export async function abrirCajaLocal(
  db: AbstractPowerSyncDatabase,
  input: AbrirCajaLocalInput,
): Promise<AbrirCajaLocalResultado> {
  const nowIso = new Date().toISOString();
  const sesionId = crypto.randomUUID();

  await db.writeTransaction(async (tx) => {
    const abierta = await tx.getOptional<{ id: string }>(
      `select id from mm_caja_sesiones
         where tenant_id = ? and sucursal_id = ? and estado = 'abierta' and deleted_at is null
         limit 1`,
      [input.tenantId, input.sucursalId],
    );
    if (abierta) {
      throw new Error(
        "Ya hay una caja abierta en esta sucursal en este dispositivo. Ciérrala antes de abrir otra.",
      );
    }

    await tx.execute(
      `insert into mm_caja_sesiones
         (id, tenant_id, sucursal_id, usuario_id, monto_inicial_usd, monto_inicial_bs, estado,
          abierta_en, created_at, updated_at)
       values (?,?,?,?,?,?,?,?,?,?)`,
      [
        sesionId,
        input.tenantId,
        input.sucursalId,
        input.usuarioId,
        input.montoInicialUsd,
        input.montoInicialBs,
        "abierta",
        nowIso,
        nowIso,
        nowIso,
      ],
    );
  });

  return { sesionId };
}

export interface MovimientoCajaLocalInput {
  tenantId: string;
  usuarioId: string;
  sesionId: string;
  tipo: MmCajaMovTipo;
  monto: number;
  moneda: "USD" | "VES";
  motivo?: string | null;
}

export async function registrarMovimientoCajaLocal(
  db: AbstractPowerSyncDatabase,
  input: MovimientoCajaLocalInput,
): Promise<void> {
  const nowIso = new Date().toISOString();
  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `insert into mm_caja_movimientos
         (id, tenant_id, sesion_id, tipo, monto, moneda, motivo, usuario_id, created_at)
       values (?,?,?,?,?,?,?,?,?)`,
      [
        crypto.randomUUID(),
        input.tenantId,
        input.sesionId,
        input.tipo,
        input.monto,
        input.moneda,
        input.motivo ?? null,
        input.usuarioId,
        nowIso,
      ],
    );
  });
}

export interface CerrarCajaLocalInput {
  tenantId: string;
  sesionId: string;
  montoFinalUsd: number;
  montoFinalBs: number;
}

export interface CerrarCajaLocalResultado {
  diferenciaUsd: number;
  diferenciaBs: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function cerrarCajaLocal(
  db: AbstractPowerSyncDatabase,
  input: CerrarCajaLocalInput,
): Promise<CerrarCajaLocalResultado> {
  const nowIso = new Date().toISOString();
  let diferenciaUsd = 0;
  let diferenciaBs = 0;

  await db.writeTransaction(async (tx) => {
    const sesion = await tx.getOptional<{
      monto_inicial_usd: number;
      monto_inicial_bs: number;
    }>(
      `select monto_inicial_usd, monto_inicial_bs from mm_caja_sesiones
         where tenant_id = ? and id = ? and estado = 'abierta'`,
      [input.tenantId, input.sesionId],
    );
    if (!sesion) throw new Error("La caja ya no está abierta en este dispositivo.");

    const movimientos = await tx.getAll<{ tipo: MmCajaMovTipo; monto: number; moneda: string }>(
      `select tipo, monto, moneda from mm_caja_movimientos where tenant_id = ? and sesion_id = ?`,
      [input.tenantId, input.sesionId],
    );

    let esperadoUsd = Number(sesion.monto_inicial_usd);
    let esperadoBs = Number(sesion.monto_inicial_bs);
    for (const m of movimientos) {
      const esUsd = m.moneda === "USD";
      const suma = m.tipo === "ingreso" || m.tipo === "venta";
      const monto = Math.abs(Number(m.monto));
      if (suma) {
        if (esUsd) esperadoUsd += monto;
        else esperadoBs += monto;
      } else {
        if (esUsd) esperadoUsd -= monto;
        else esperadoBs -= monto;
      }
    }

    diferenciaUsd = round2(input.montoFinalUsd - esperadoUsd);
    diferenciaBs = round2(input.montoFinalBs - esperadoBs);

    await tx.execute(
      `update mm_caja_sesiones set
         estado = 'cerrada', monto_final_usd = ?, monto_final_bs = ?, diferencia_usd = ?,
         diferencia_bs = ?, cerrada_en = ?, updated_at = ?
       where tenant_id = ? and id = ?`,
      [
        input.montoFinalUsd,
        input.montoFinalBs,
        diferenciaUsd,
        diferenciaBs,
        nowIso,
        nowIso,
        input.tenantId,
        input.sesionId,
      ],
    );
  });

  return { diferenciaUsd, diferenciaBs };
}

export interface TasaManualLocalInput {
  tenantId: string;
  usuarioId: string;
  /** Cuál de las 3 tasas está editando a mano (BCV, Euro o Personalizada). */
  tipo: MmTipoTasa;
  valor: number;
}

/**
 * Valor escrito A MANO para cualquiera de las 3 tasas, offline — el negocio
 * puede sobreescribir BCV o Euro BCV igual que Personalizada, sin depender de
 * la API. `fuente` siempre queda "manual" (el origen real del dato); `tipo`
 * es cuál de las 3 tasas es. SOLO guarda el valor — "Guardar" y "Hacer
 * predeterminada" son acciones independientes (ver `marcarFuentePreferidaLocal`);
 * guardar un valor nuevo YA NO cambia sola la tasa preseleccionada del sistema.
 */
export async function definirTasaManualLocal(
  db: AbstractPowerSyncDatabase,
  input: TasaManualLocalInput,
): Promise<void> {
  const nowIso = new Date().toISOString();
  await db.execute(
    `insert into mm_tasas_cambio (id, tenant_id, fecha, valor, fuente, tipo, usuario_id, created_at)
     values (?,?,?,?,?,?,?,?)`,
    [
      crypto.randomUUID(),
      input.tenantId,
      nowIso,
      input.valor,
      "manual",
      input.tipo,
      input.usuarioId,
      nowIso,
    ],
  );
}

/**
 * Marca `tipo` como la tasa PRESELECCIONADA del negocio (la que usa el POS
 * por defecto), offline — acción independiente de guardar un valor: el
 * cajero puede tener registrado un valor para BCV sin que sea la tasa activa.
 */
export async function marcarFuentePreferidaLocal(
  db: AbstractPowerSyncDatabase,
  tenantId: string,
  tipo: MmTipoTasa,
): Promise<void> {
  const nowIso = new Date().toISOString();
  await db.writeTransaction(async (tx) => {
    const config = await tx.getOptional<{ id: string }>(
      `select id from mm_config_negocio where tenant_id = ? limit 1`,
      [tenantId],
    );
    if (config) {
      await tx.execute(
        `update mm_config_negocio set fuente_tasa = ?, updated_at = ? where id = ?`,
        [tipo, nowIso, config.id],
      );
    } else {
      await tx.execute(
        `insert into mm_config_negocio
           (id, tenant_id, nombre_comercial, fuente_tasa, parametros, metodos_pago, datos_fiscales, created_at, updated_at)
         values (?,?,?,?,?,?,?,?,?)`,
        [crypto.randomUUID(), tenantId, "Mi negocio", tipo, "{}", "[]", "{}", nowIso, nowIso],
      );
    }
  });
}
