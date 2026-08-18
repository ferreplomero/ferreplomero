"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getCountryConfig } from "@arkiteq/core";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { IGTF_RATE, causaIgtf } from "@/lib/minimarket/constants";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { fmtFechaHora } from "@/lib/minimarket/date-format";
import type { DocumentoFiscal } from "@/lib/minimarket/documento";
import {
  anularVenta,
  anularVentaConDevolucion,
  getVentaParaAnular,
  getVentaParaRecibo,
  type VentaParaAnular,
} from "@/lib/minimarket/data/ventas";
import {
  METODOS_PAGO_IDS,
  parseMetodosPago,
  type MetodoPagoConfigItem,
} from "@/lib/minimarket/metodos-pago";
import {
  esMetodoConCuenta,
  esMetodoVueltoDigital,
  METODO_CUENTA_LABEL,
} from "@/lib/minimarket/bancos";
import { esEfectivo, subtotalNetoGravado, subtotalNetoSujetoIgtf } from "@/lib/minimarket/pos-calc";
import { getSesionAbierta } from "@/lib/minimarket/data/caja";
import { listCuentasBancarias } from "@/lib/minimarket/data/bancos";
import type { MmCreditoClienteTipo, MmCuentaBancaria, MmMetodoPago } from "@arkiteq/db";
import { requirePermisoAccion } from "@/lib/minimarket/permisos";
import { sucursalesPermitidas, esCatalogoIrrestricto } from "@/lib/minimarket/sucursal-acceso";

export interface VentaItemInput {
  producto_id: string;
  cantidad: number;
  /**
   * Precio unitario puntual para ESTA venta (no cambia `mm_productos.precio_usd`).
   * Se ignora en silencio si el usuario no tiene el permiso `ventas.editar` — la
   * venta nunca se bloquea por esto, simplemente cobra el precio de catálogo.
   */
  precio_usd_override?: number;
  /** Motivo opcional que escribió el cajero al ajustar el precio. */
  motivo_ajuste_precio?: string;
  /**
   * Override puntual de IVA/IGTF SOLO para esta línea de ESTA venta (toggle
   * por producto en el carrito) — `undefined` = usa el estado guardado del
   * producto (`mm_productos.impuesto_id`/`aplica_igtf`), igual que siempre.
   * Nunca toca `mm_productos`: lo que termine aplicándose queda congelado en
   * `mm_ventas_items.impuesto_id`/`aplica_igtf` de esta venta, mismo criterio
   * que `precio_usd_override`.
   */
  iva_override?: boolean;
  igtf_override?: boolean;
}

export interface PagoInput {
  metodo: MmMetodoPago;
  monto: number;
  moneda: "USD" | "VES";
  /** Cuenta bancaria del negocio que recibe este pago (solo pago_movil/transferencia/
   * tarjeta). Se revalida contra la base antes de usarse — nunca bloquea la venta si
   * no es válida, simplemente se guarda sin cuenta asignada. */
  cuenta_bancaria_id?: string | null;
}

export interface VueltoInput {
  monto: number;
  moneda: "USD" | "VES";
}

/**
 * Vuelto entregado por un medio digital (pago móvil/transferencia) en vez de
 * efectivo — mutuamente excluyente con `vuelto` (un mismo sobrante, un solo
 * destino). Egresa de la cuenta bancaria elegida en vez de la caja física.
 */
export interface VueltoDigitalInput {
  cuenta_bancaria_id: string;
  monto: number;
  moneda: "USD" | "VES";
}

/**
 * Tercera alternativa a `vuelto`/`vuelto_digital`: el mismo excedente, en vez
 * de devolverse, queda como saldo a favor del cliente para una venta futura.
 * Requiere `cliente_id` — se valida en el servidor, nunca solo en la UI.
 */
export interface CreditoOtorgadoInput {
  monto: number;
}

export interface VentaInput {
  items: VentaItemInput[];
  pagos: PagoInput[];
  descuento_usd?: number;
  sucursal_id?: string;
  cliente_id?: string | null;
  /** Tasa elegida por el cajero para ESTA venta, si difiere de la tasa del día. */
  tasa_override?: number;
  /**
   * Override puntual del IGTF/IVA SOLO para esta venta (botones del diálogo
   * de cobro) — nunca toca `mm_config_negocio.parametros` ni `mm_productos`.
   * `undefined` = usa el default del negocio, igual que siempre. Lo que
   * termine aplicándose queda congelado en `subtotal_usd`/`igtf_usd`/
   * `total_usd` de la venta, así que Finanzas/recibo ya reflejan la realidad
   * de esta venta sin ningún cambio adicional (ver CLAUDE.md, regla de
   * impuestos puntuales).
   */
  igtf_activo_override?: boolean;
  iva_activo_override?: boolean;
  /**
   * Vuelto REAL en efectivo que se le entrega al cliente (moneda elegida por
   * el cajero, puede ser distinta a la del pago). Se registra como egreso de
   * caja para que el efectivo neto en la gaveta sea el correcto — sin esto,
   * un pago de $100 por una venta de $50 quedaría contado como $100 de
   * ingreso sin el egreso de los $50 de vuelto (ver CLAUDE.md regla 13).
   */
  vuelto?: VueltoInput;
  /** Alternativa a `vuelto`: el mismo sobrante entregado por cuenta bancaria. */
  vuelto_digital?: VueltoDigitalInput;
  /** Alternativa a `vuelto`/`vuelto_digital`: el excedente se acredita al cliente. */
  credito_otorgado?: CreditoOtorgadoInput;
}

export interface VentaResult {
  ok?: boolean;
  ventaId?: string;
  error?: string;
}

// Lista única de métodos válidos: `METODOS_PAGO_IDS` (@/lib/minimarket/metodos-pago).
// Antes vivía duplicada acá a mano — así fue como Cashea quedó agregado en la
// config y en el selector del POS pero rechazado por Zod al confirmar la
// venta ("Invalid enum value... received 'cashea'"): esta copia local no se
// actualizó junto con las demás. No volver a duplicar esta lista.
// "credito_cliente" NO vive en METODOS_PAGO_IDS a propósito: no es un método
// que el negocio active/desactive en Configuración (como pago móvil o
// Zelle) — siempre está disponible si el cliente tiene saldo, y solo se
// agrega desde el botón dedicado "Usar saldo a favor" del POS.
const METODOS_PAGO_VENTA = [...METODOS_PAGO_IDS, "credito_cliente"] as const;

const pagoSchema = z.object({
  metodo: z.enum(METODOS_PAGO_VENTA),
  monto: z.coerce.number().nonnegative("El monto de pago no puede ser negativo."),
  moneda: z.enum(["USD", "VES"]),
  cuenta_bancaria_id: z.string().uuid().nullable().optional(),
});

const ventaSchema = z
  .object({
    items: z
      .array(
        z.object({
          producto_id: z.string().uuid(),
          cantidad: z.coerce.number().positive(),
          precio_usd_override: z.coerce.number().positive().optional(),
          motivo_ajuste_precio: z.string().trim().max(200).optional(),
          iva_override: z.boolean().optional(),
          igtf_override: z.boolean().optional(),
        }),
      )
      .min(1, "Agrega al menos un producto."),
    pagos: z
      .array(pagoSchema)
      .min(1, "Indica al menos un método de pago.")
      .refine(
        (pagos) => pagos.filter((p) => p.metodo === "fiado").length <= 1,
        "Solo puede haber un pago de tipo fiado por venta.",
      ),
    descuento_usd: z.coerce.number().nonnegative().optional().default(0),
    sucursal_id: z.string().uuid().optional(),
    cliente_id: z.string().uuid().nullable().optional(),
    tasa_override: z.coerce.number().positive().optional(),
    igtf_activo_override: z.boolean().optional(),
    iva_activo_override: z.boolean().optional(),
    vuelto: z
      .object({
        monto: z.coerce.number().positive(),
        moneda: z.enum(["USD", "VES"]),
      })
      .optional(),
    // Alternativa a `vuelto`: mismo sobrante, entregado por cuenta bancaria
    // en vez de efectivo (ver CLAUDE.md — la caja física no se toca en ese caso).
    vuelto_digital: z
      .object({
        cuenta_bancaria_id: z.string().uuid(),
        monto: z.coerce.number().positive(),
        moneda: z.enum(["USD", "VES"]),
      })
      .optional(),
    // Tercera alternativa: el excedente se acredita al cliente en vez de devolverse.
    credito_otorgado: z
      .object({
        monto: z.coerce.number().positive(),
      })
      .optional(),
  })
  .refine(
    (v) => [v.vuelto, v.vuelto_digital, v.credito_otorgado].filter(Boolean).length <= 1,
    "El excedente solo puede resolverse de una forma a la vez.",
  );

const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * Registra una venta completa con soporte de pago mixto (N métodos simultáneos)
 * y descuento global. Congela la tasa, recalcula totales en el servidor, aplica
 * IGTF sobre la porción pagada en divisa, descuenta stock y registra todos los pagos.
 */
export async function registrarVenta(input: VentaInput): Promise<VentaResult> {
  try {
    const session = await getSessionContext();
    const tenantId = session?.activeTenant?.id;
    if (!session || !tenantId) return { error: "Sesión no válida. Vuelve a iniciar sesión." };

    const parsed = ventaSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Datos de la venta inválidos." };
    }
    const v = parsed.data;

    const tieneFiado = v.pagos.some((p) => p.metodo === "fiado");
    if (tieneFiado && !v.cliente_id) {
      return { error: "Para fiar debes elegir un cliente." };
    }

    const tieneCredito = v.pagos.some((p) => p.metodo === "credito_cliente");
    if (tieneCredito && !v.cliente_id) {
      return { error: "Para usar el saldo a favor debes elegir un cliente." };
    }
    if (v.credito_otorgado && !v.cliente_id) {
      return { error: "Para acreditar el excedente debes elegir un cliente." };
    }

    const supabase = await createClient();
    const permisoError = await requirePermisoAccion(
      supabase,
      tenantId,
      session.user.id,
      "ventas",
      "crear",
    );
    if (permisoError) return { error: permisoError };

    // Precio ajustado por línea (puntual para esta venta, no toca el
    // catálogo): requiere el permiso `ventas.editar` además de `ventas.crear`.
    // Si el usuario no lo tiene, el override se ignora en silencio más abajo
    // (`cuentaValidaParaPago`-style: nunca bloquea la venta, solo cobra el
    // precio normal del catálogo) — así que aquí solo se resuelve la bandera,
    // no se rechaza la venta.
    const tienePermisoAjustePrecio = v.items.some((i) => i.precio_usd_override !== undefined)
      ? !(await requirePermisoAccion(supabase, tenantId, session.user.id, "ventas", "editar"))
      : false;

    // Todas las LECTURAS de esta venta son independientes entre sí (tasa,
    // config, sucursal, precios reales, correlativo y — si aplica fiado —
    // cliente/saldo): antes se pedían una por una en serie (hasta 6 idas y
    // vueltas a la BD antes de escribir nada); ahora van en un solo
    // Promise.all. Las condicionales usan un Promise.resolve de respaldo
    // para no complicar el paralelismo con ramas opcionales.
    const ids = v.items.map((i) => i.producto_id);
    const clienteIdParaFiado = tieneFiado ? (v.cliente_id ?? null) : null;
    const clienteIdParaCredito = tieneCredito ? (v.cliente_id ?? null) : null;

    // Cuentas bancarias que el cajero eligió (pago digital y/o vuelto digital)
    // — se revalidan contra la base antes de confiar en ellas (ver más abajo).
    const cuentaIdsReferenciadas = [
      ...new Set(
        [
          ...v.pagos.map((p) => p.cuenta_bancaria_id ?? null),
          v.vuelto_digital?.cuenta_bancaria_id ?? null,
        ].filter((id): id is string => id !== null),
      ),
    ];

    const [
      tasa,
      configRes,
      permitidas,
      prodRes,
      countRes,
      clResult,
      svResult,
      cuentasRes,
      svCreditoResult,
    ] = await Promise.all([
      getTasaVigente(supabase, tenantId),
      supabase
        .from("mm_config_negocio")
        .select("parametros")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      sucursalesPermitidas(supabase, tenantId, session.user.id),
      supabase
        .from("mm_productos")
        .select("id, nombre, precio_usd, impuesto_id, aplica_igtf")
        .eq("tenant_id", tenantId)
        .in("id", ids)
        .is("deleted_at", null),
      supabase
        .from("mm_ventas")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
      clienteIdParaFiado
        ? supabase
            .from("mm_clientes")
            .select("nombre, limite_fiado_usd")
            .eq("id", clienteIdParaFiado)
            .eq("tenant_id", tenantId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      clienteIdParaFiado
        ? supabase
            .from("mm_v_saldo_cliente")
            .select("saldo_usd")
            .eq("cliente_id", clienteIdParaFiado)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      cuentaIdsReferenciadas.length > 0
        ? supabase
            .from("mm_cuentas_bancarias")
            .select("id, metodo")
            .eq("tenant_id", tenantId)
            .in("id", cuentaIdsReferenciadas)
            .is("deleted_at", null)
        : Promise.resolve({ data: [] as { id: string; metodo: MmMetodoPago }[], error: null }),
      clienteIdParaCredito
        ? supabase
            .from("mm_v_saldo_credito_cliente")
            .select("saldo_usd")
            .eq("cliente_id", clienteIdParaCredito)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (!tasa) return { error: "Define la tasa del día antes de vender." };
    // El cajero puede ajustar la tasa de esta venta puntual (ej. cobrar a tasa
    // Euro/digital en vez de la configurada); el resto de la lógica no cambia.
    const tasaUsada = v.tasa_override && v.tasa_override > 0 ? v.tasa_override : tasa.valor;
    const params = (configRes.data?.parametros as Record<string, unknown>) ?? {};
    // El cajero puede activar/desactivar IGTF e IVA solo para ESTA venta desde
    // el diálogo de cobro (`igtf_activo_override`/`iva_activo_override`) — un
    // override puntual que nunca escribe en `mm_config_negocio` ni en ningún
    // producto: si no viene override, se usa el default del negocio, igual
    // que siempre. Lo que se aplique aquí queda congelado en
    // subtotal_usd/igtf_usd/total_usd de la venta, así que Finanzas y el
    // recibo (que leen esos campos ya guardados) reflejan exactamente lo
    // cobrado en esta venta sin necesitar ningún cambio propio.
    const igtfActivo = v.igtf_activo_override ?? params.igtf_activo !== false;
    const ivaActivo = v.iva_activo_override ?? Boolean(params.iva_activo ?? false);
    const ivaPct = Number(params.iva_pct ?? 16);

    // Sucursal destino: si el cajero mandó una, debe ser una a la que tiene
    // acceso (nunca se confía a ciegas, mismo criterio que
    // `cambiarSucursalActivaAction`); si no mandó ninguna, se usa su primera
    // sucursal permitida — nunca "la primera del tenant".
    if (v.sucursal_id && !permitidas.some((s) => s.id === v.sucursal_id)) {
      return { error: "No tienes acceso a esa sucursal." };
    }
    const sucursalId = v.sucursal_id ?? permitidas[0]?.id ?? null;
    if (!sucursalId) return { error: "No tienes ninguna sucursal asignada." };

    // Blindaje de servidor: cada producto vendido debe tener presencia en la
    // sucursal de ESTA venta. El picker del POS ya filtra el catálogo que
    // ofrece, pero eso es solo UI — esto es lo que lo hace cumplir aunque el
    // cajero mande un producto_id ajeno directo al action, saltándose la UI.
    // Ancla en mm_inventario/mm_v_stock, ya blindadas por RLS (0111/0112):
    // aunque alguien manipule este chequeo, la consulta nunca puede devolver
    // filas de una sucursal fuera del alcance del usuario.
    const irrestricto = await esCatalogoIrrestricto(supabase, tenantId, session.user.id);
    let presentesEnSucursal: Set<string> | null = null;
    if (!irrestricto) {
      const [{ data: invPresente }, { data: stockPresente }] = await Promise.all([
        supabase
          .from("mm_inventario")
          .select("producto_id")
          .eq("tenant_id", tenantId)
          .eq("sucursal_id", sucursalId)
          .in("producto_id", ids)
          .is("deleted_at", null),
        supabase
          .from("mm_v_stock")
          .select("producto_id")
          .eq("tenant_id", tenantId)
          .eq("sucursal_id", sucursalId)
          .in("producto_id", ids),
      ]);
      presentesEnSucursal = new Set(
        [...(invPresente ?? []), ...(stockPresente ?? [])]
          .map((r) => r.producto_id)
          .filter((id): id is string => id !== null),
      );
    }

    // Cuentas bancarias elegidas por el cajero, revalidadas contra la base:
    // deben existir, pertenecer al tenant y coincidir con el método del pago.
    // Un id que ya no aplica (ej. la cuenta se eliminó a mitad del cobro) se
    // ignora en silencio — nunca bloquea la venta, solo queda sin cuenta.
    if (cuentasRes.error) return { error: "No se pudieron validar las cuentas bancarias." };
    const cuentasMap = new Map((cuentasRes.data ?? []).map((c) => [c.id, c.metodo]));
    const cuentaValidaParaPago = (p: (typeof v.pagos)[number]): string | null => {
      if (!p.cuenta_bancaria_id || !esMetodoConCuenta(p.metodo)) return null;
      return cuentasMap.get(p.cuenta_bancaria_id) === p.metodo ? p.cuenta_bancaria_id : null;
    };
    const vueltoDigitalMetodo = v.vuelto_digital
      ? cuentasMap.get(v.vuelto_digital.cuenta_bancaria_id)
      : undefined;
    const vueltoDigitalValido =
      v.vuelto_digital && vueltoDigitalMetodo && esMetodoVueltoDigital(vueltoDigitalMetodo)
        ? v.vuelto_digital
        : undefined;

    // Un pago digital (pago móvil/transferencia/tarjeta/Zelle/Cashea) SIEMPRE
    // debe quedar ligado a una cuenta bancaria real — nunca se guarda "suelto".
    // Antes, si la cuenta elegida ya no existía o no coincidía con el método
    // (borrada/desactivada a mitad del cobro, o el negocio no tiene ninguna
    // cuenta configurada para ese método), `cuentaValidaParaPago` devolvía
    // null y la venta se completaba igual sin cuenta asociada. Se bloquea acá
    // para que el cajero elija otra cuenta antes de confirmar.
    for (const p of v.pagos) {
      if (esMetodoConCuenta(p.metodo) && !cuentaValidaParaPago(p)) {
        return {
          error: `La cuenta bancaria elegida para el pago por ${METODO_CUENTA_LABEL[p.metodo]} ya no está disponible. Elige otra cuenta en Bancos → ${METODO_CUENTA_LABEL[p.metodo]} y vuelve a intentar la venta.`,
        };
      }
    }

    // Precios reales desde la BD (no se confía en el cliente).
    if (prodRes.error) return { error: "No se pudieron leer los productos." };
    const mapa = new Map((prodRes.data ?? []).map((p) => [p.id, p]));
    const lineas = v.items.map((item) => {
      const prod = mapa.get(item.producto_id);
      if (!prod) return null;
      if (presentesEnSucursal && !presentesEnSucursal.has(prod.id)) return null;
      // El precio ajustado SOLO se aplica si el usuario tiene el permiso —
      // de lo contrario cobra el precio de catálogo, exactamente como hoy.
      // `mm_productos.precio_usd` nunca se toca en ningún caso: el ajuste
      // vive solo en esta línea de esta venta.
      const override =
        tienePermisoAjustePrecio && item.precio_usd_override !== undefined
          ? item.precio_usd_override
          : null;
      const usaAjuste = override !== null;
      const precioUnitario = override ?? Number(prod.precio_usd);
      const total = redondear(precioUnitario * item.cantidad);
      // Override puntual de IVA/IGTF de esta línea, SOLO para esta venta —
      // nunca toca `mm_productos`. `undefined` = usa el estado guardado del
      // producto, igual que siempre. Lo que se resuelva aquí queda congelado
      // en `mm_ventas_items.impuesto_id`/`aplica_igtf` de esta venta.
      const aplicaIva = item.iva_override ?? prod.impuesto_id !== "exento";
      const impuestoIdEfectivo = aplicaIva
        ? prod.impuesto_id === "exento"
          ? "iva"
          : prod.impuesto_id
        : "exento";
      const aplicaIgtfLinea = item.igtf_override ?? prod.aplica_igtf;
      return {
        producto_id: prod.id,
        descripcion: prod.nombre,
        cantidad: item.cantidad,
        precio_usd: precioUnitario,
        impuesto_id: impuestoIdEfectivo,
        aplica_igtf: aplicaIgtfLinea,
        total_usd: total,
        precio_ajustado: usaAjuste,
        motivo_ajuste_precio: usaAjuste ? (item.motivo_ajuste_precio ?? null) : null,
      };
    });
    if (lineas.some((l) => l === null)) {
      return { error: "Uno de los productos ya no está disponible." };
    }
    const items = lineas as NonNullable<(typeof lineas)[number]>[];

    const subtotalBruto = redondear(items.reduce((s, l) => s + l.total_usd, 0));
    const descuento = redondear(Math.min(v.descuento_usd, subtotalBruto));
    const subtotalNeto = redondear(subtotalBruto - descuento);

    // IGTF: aplica a la porción pagada en divisa (efectivo_usd, zelle) si está
    // activo, escalado a la proporción del carrito cuyas líneas realmente
    // causan IGTF (`aplica_igtf` por producto, o su override puntual en esta
    // venta) — un producto marcado sin IGTF nunca debe sumarlo, ni solo ni
    // mezclado con productos que sí lo causan en la misma venta. Cuando TODAS
    // las líneas causan IGTF (el caso de hoy y de todo el historial) la
    // proporción es 1 y el cálculo queda idéntico al de siempre.
    const subtotalSujetoIgtf = subtotalNetoSujetoIgtf(
      items.map((i) => ({ totalUsd: i.total_usd, aplicaIgtf: i.aplica_igtf })),
      descuento,
    );
    const proporcionIgtf = subtotalNeto > 0 ? Math.min(1, subtotalSujetoIgtf / subtotalNeto) : 1;
    let igtfTotal = 0;
    if (igtfActivo) {
      for (const pago of v.pagos) {
        if (causaIgtf(pago.metodo)) {
          const montoUsd = pago.moneda === "USD" ? pago.monto : pago.monto / tasaUsada;
          igtfTotal += montoUsd * IGTF_RATE * proporcionIgtf;
        }
      }
    }
    const igtf = redondear(igtfTotal);
    // IVA sobre el subtotal neto si está activo — SOLO sobre las líneas
    // gravadas: un producto marcado "Exento" (`impuesto_id = "exento"`) en su
    // ficha (o por override puntual de esta venta) nunca debe pagar IVA, ni
    // solo ni mezclado con productos gravados en la misma venta (CLAUDE.md,
    // módulo Ventas). `subtotalNetoGravado` reparte el descuento
    // proporcionalmente para que gravado + exento sigan sumando exactamente
    // `subtotalNeto`.
    const subtotalGravado = subtotalNetoGravado(
      items.map((i) => ({ totalUsd: i.total_usd, impuestoId: i.impuesto_id })),
      descuento,
    );
    const ivaTotal = ivaActivo && ivaPct > 0 ? redondear((subtotalGravado * ivaPct) / 100) : 0;
    const totalUsd = redondear(subtotalNeto + igtf + ivaTotal);
    const totalBs = redondear(totalUsd * tasaUsada);

    // Verifica que los pagos cubran el total (con tolerancia de 0.02 por redondeo).
    const sumPagosUsd = redondear(
      v.pagos.reduce((s, p) => {
        // fiado y credito_cliente ya vienen en USD, sin conversión.
        if (p.metodo === "fiado" || p.metodo === "credito_cliente") return s + p.monto;
        return s + (p.moneda === "USD" ? p.monto : p.monto / tasaUsada);
      }, 0),
    );
    if (sumPagosUsd < totalUsd - 0.02) {
      return {
        error: `Los pagos ($${sumPagosUsd.toFixed(2)}) no cubren el total ($${totalUsd.toFixed(2)}).`,
      };
    }

    // El saldo a favor usado no puede exceder lo que el cliente realmente
    // tiene disponible — se revalida contra la base, nunca se confía en lo
    // que mandó el navegador (mismo criterio que el límite de fiado).
    if (tieneCredito && v.cliente_id) {
      const creditoPago = v.pagos.find((p) => p.metodo === "credito_cliente");
      const montoCredito = creditoPago?.monto ?? 0;
      const saldoFavorReal = Number(svCreditoResult.data?.saldo_usd ?? 0);
      if (montoCredito > saldoFavorReal + 0.01) {
        return {
          error: `El saldo a favor disponible es $${saldoFavorReal.toFixed(2)}, no alcanza para cubrir $${montoCredito.toFixed(2)}.`,
        };
      }
    }

    // El excedente a acreditar no puede ser mayor que el excedente real de la
    // venta (pagos menos total) — se recalcula en el servidor, nunca se
    // confía en el monto que mandó el navegador.
    if (v.credito_otorgado) {
      const excedenteReal = Math.max(0, redondear(sumPagosUsd - totalUsd));
      if (v.credito_otorgado.monto > excedenteReal + 0.02) {
        return { error: "El monto a acreditar no coincide con el excedente real de la venta." };
      }
    }

    // Validación del límite de crédito con el total real de la venta
    // (cliente y saldo ya se leyeron arriba, en paralelo con todo lo demás).
    if (tieneFiado && v.cliente_id) {
      const fiadoPago = v.pagos.find((p) => p.metodo === "fiado");
      const montoFiado = fiadoPago?.monto ?? totalUsd;

      const cl = clResult.data;
      const saldoActual = Number(svResult.data?.saldo_usd ?? 0);
      const limite = Number(cl?.limite_fiado_usd ?? 0);

      if (limite > 0 && saldoActual + montoFiado > limite + 0.001) {
        return {
          error: `Esta operación ($${montoFiado.toFixed(2)} a fiado) supera el límite de ${cl?.nombre ?? "este cliente"} ($${limite.toFixed(2)}). Saldo actual: $${saldoActual.toFixed(2)}, disponible: $${Math.max(0, limite - saldoActual).toFixed(2)}.`,
        };
      }
    }

    // Un pago en efectivo (o un vuelto en efectivo) SIEMPRE debe poder entrar/
    // salir de la caja física — si no hay sesión abierta, se bloquea la venta
    // completa en vez de dejarla "completada" con ese efectivo sin reflejar
    // en ningún lado (mismo criterio que ya usan Gastos/Compras/Otros-ingresos,
    // CLAUDE.md regla crítica #1). Los pagos digitales no dependen de esto.
    const tocaCaja = v.pagos.some((p) => esEfectivo(p.metodo)) || Boolean(v.vuelto);
    if (tocaCaja) {
      const sesion = await getSesionAbierta(supabase, tenantId, sucursalId);
      if (!sesion) {
        return {
          error:
            "Debes abrir la caja antes de cobrar en efectivo. Ve a Caja → Abrir caja y vuelve a intentar la venta.",
        };
      }
    }

    // Número de documento correlativo (el conteo ya se leyó arriba).
    const numero = `R-${String((countRes.count ?? 0) + 1).padStart(6, "0")}`;

    // Cabecera de la venta.
    const { data: venta, error: ventaError } = await supabase
      .from("mm_ventas")
      .insert({
        tenant_id: tenantId,
        sucursal_id: sucursalId,
        usuario_id: session.user.id,
        cliente_id: v.cliente_id ?? null,
        tasa_usada: tasaUsada,
        subtotal_usd: subtotalNeto,
        descuento_usd: descuento,
        igtf_usd: igtf,
        total_usd: totalUsd,
        total_bs: totalBs,
        tipo_documento: "recibo",
        numero_documento: numero,
        estado: "completada",
      })
      .select("id")
      .single();

    if (ventaError || !venta) {
      console.error("[registrarVenta] error al insertar mm_ventas:", ventaError);
      return {
        error: ventaError?.message
          ? `No se pudo registrar la venta: ${ventaError.message}`
          : "No se pudo registrar la venta. Inténtalo de nuevo.",
      };
    }

    // Todo lo de abajo (renglones, pagos, caja, fiado, stock) solo depende de
    // `venta.id` — ya no depende entre sí, así que va en un solo Promise.all
    // en vez de 4-5 idas y vueltas en serie. Caja y fiado ya eran "best
    // effort" en el código original (nunca se revisaba su `.error`); eso no
    // cambia, solo el orden en que se disparan.
    const pagosEfectivo = v.pagos.filter(
      (p) => p.metodo === "efectivo_bs" || p.metodo === "efectivo_usd",
    );

    // Recibe tenantId/ventaId/usuarioId como parámetros (no por closure): TS
    // no retiene el narrowing de `session`/`venta` dentro de una función
    // anidada declarada después del `if (!venta) return`.
    async function registrarMovimientoCaja(
      tenantIdActual: string,
      ventaId: string,
      usuarioId: string,
      sucursalIdActual: string,
    ): Promise<void> {
      if (pagosEfectivo.length === 0 && !v.vuelto) return;
      const { data: sesion } = await supabase
        .from("mm_caja_sesiones")
        .select("id")
        .eq("tenant_id", tenantIdActual)
        .eq("sucursal_id", sucursalIdActual)
        .eq("estado", "abierta")
        .is("deleted_at", null)
        .order("abierta_en", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!sesion) return;
      const movimientos: {
        tenant_id: string;
        sesion_id: string;
        tipo: "venta" | "egreso";
        monto: number;
        moneda: "USD" | "VES";
        motivo: string;
        referencia: string;
        usuario_id: string;
      }[] = pagosEfectivo.map((p) => ({
        tenant_id: tenantIdActual,
        sesion_id: sesion.id,
        tipo: "venta",
        monto: p.monto,
        moneda: p.moneda,
        motivo: `Venta ${numero}`,
        referencia: ventaId,
        usuario_id: usuarioId,
      }));
      // Vuelto real entregado en efectivo: sale de la gaveta como egreso, para
      // que el efectivo neto (lo que entró menos lo que se devolvió) sea el
      // correcto en el arqueo — sin esto, un pago de $100 por una venta de $50
      // quedaría contado íntegro como ingreso, sin el egreso de los $50 de vuelto.
      if (v.vuelto && v.vuelto.monto > 0.001) {
        movimientos.push({
          tenant_id: tenantIdActual,
          sesion_id: sesion.id,
          tipo: "egreso",
          monto: v.vuelto.monto,
          moneda: v.vuelto.moneda,
          motivo: `Vuelto venta ${numero}`,
          referencia: ventaId,
          usuario_id: usuarioId,
        });
      }
      await supabase.from("mm_caja_movimientos").insert(movimientos);
    }

    // Espejo de `registrarMovimientoCaja` pero para el dinero digital: cada
    // pago con cuenta validada entra como "venta" a esa cuenta, y si el vuelto
    // se eligió por banco, sale como "egreso" de la cuenta elegida — nunca de
    // la caja física (esa es la única diferencia con el camino de arriba,
    // que NO se toca).
    async function registrarMovimientoCuenta(
      tenantIdActual: string,
      ventaId: string,
      usuarioId: string,
    ): Promise<void> {
      const movimientos: {
        tenant_id: string;
        cuenta_id: string;
        tipo: "venta" | "egreso";
        monto_usd: number;
        monto_bs: number;
        tasa_usada: number;
        motivo: string;
        referencia: string;
        usuario_id: string;
      }[] = [];

      for (const p of v.pagos) {
        const cuentaId = cuentaValidaParaPago(p);
        if (!cuentaId) continue;
        const montoUsd = p.moneda === "USD" ? p.monto : p.monto / tasaUsada;
        const montoBs = p.moneda === "VES" ? p.monto : p.monto * tasaUsada;
        movimientos.push({
          tenant_id: tenantIdActual,
          cuenta_id: cuentaId,
          tipo: "venta",
          monto_usd: redondear(montoUsd),
          monto_bs: redondear(montoBs),
          tasa_usada: tasaUsada,
          motivo: `Venta ${numero}`,
          referencia: ventaId,
          usuario_id: usuarioId,
        });
      }

      if (vueltoDigitalValido && vueltoDigitalValido.monto > 0.001) {
        const montoUsd =
          vueltoDigitalValido.moneda === "USD"
            ? vueltoDigitalValido.monto
            : vueltoDigitalValido.monto / tasaUsada;
        const montoBs =
          vueltoDigitalValido.moneda === "VES"
            ? vueltoDigitalValido.monto
            : vueltoDigitalValido.monto * tasaUsada;
        movimientos.push({
          tenant_id: tenantIdActual,
          cuenta_id: vueltoDigitalValido.cuenta_bancaria_id,
          tipo: "egreso",
          monto_usd: redondear(montoUsd),
          monto_bs: redondear(montoBs),
          tasa_usada: tasaUsada,
          motivo: `Vuelto venta ${numero}`,
          referencia: ventaId,
          usuario_id: usuarioId,
        });
      }

      if (movimientos.length === 0) return;
      await supabase.from("mm_cuenta_movimientos").insert(movimientos);
    }

    // Saldo a favor del cliente: "usado" si esta venta se pagó (en parte) con
    // saldo a favor, "otorgado" si el excedente de esta venta se acreditó en
    // vez de devolverse. Ambos ya fueron validados contra la base arriba.
    async function registrarMovimientosCredito(
      tenantIdActual: string,
      ventaId: string,
      usuarioIdActual: string,
    ): Promise<void> {
      const movimientos: {
        tenant_id: string;
        cliente_id: string;
        tipo: MmCreditoClienteTipo;
        monto_usd: number;
        monto_bs: number;
        tasa_usada: number;
        motivo: string;
        referencia: string;
        usuario_id: string;
      }[] = [];

      if (tieneCredito && v.cliente_id) {
        const creditoPago = v.pagos.find((p) => p.metodo === "credito_cliente");
        const montoCredito = creditoPago?.monto ?? 0;
        if (montoCredito > 0.001) {
          movimientos.push({
            tenant_id: tenantIdActual,
            cliente_id: v.cliente_id,
            tipo: "usado",
            monto_usd: redondear(montoCredito),
            monto_bs: redondear(montoCredito * tasaUsada),
            tasa_usada: tasaUsada,
            motivo: `Aplicado en venta ${numero}`,
            referencia: ventaId,
            usuario_id: usuarioIdActual,
          });
        }
      }

      if (v.credito_otorgado && v.cliente_id && v.credito_otorgado.monto > 0.001) {
        movimientos.push({
          tenant_id: tenantIdActual,
          cliente_id: v.cliente_id,
          tipo: "otorgado",
          monto_usd: redondear(v.credito_otorgado.monto),
          monto_bs: redondear(v.credito_otorgado.monto * tasaUsada),
          tasa_usada: tasaUsada,
          motivo: `Excedente acreditado de la venta ${numero}`,
          referencia: ventaId,
          usuario_id: usuarioIdActual,
        });
      }

      if (movimientos.length === 0) return;
      await supabase.from("mm_creditos_cliente").insert(movimientos);
    }

    const [itemsRes, pagosRes] = await Promise.all([
      supabase.from("mm_ventas_items").insert(
        items.map((l) => ({
          tenant_id: tenantId,
          venta_id: venta.id,
          producto_id: l.producto_id,
          descripcion: l.descripcion,
          cantidad: l.cantidad,
          precio_usd: l.precio_usd,
          impuesto_id: l.impuesto_id,
          aplica_igtf: l.aplica_igtf,
          total_usd: l.total_usd,
          precio_ajustado: l.precio_ajustado,
          motivo_ajuste_precio: l.motivo_ajuste_precio,
        })),
      ),
      // Pagos (uno por método — N filas para pago mixto).
      supabase.from("mm_pagos_venta").insert(
        v.pagos.map((p) => ({
          tenant_id: tenantId,
          venta_id: venta.id,
          metodo: p.metodo,
          monto: p.monto,
          moneda: p.moneda,
          tasa_usada: tasaUsada,
          cuenta_bancaria_id: cuentaValidaParaPago(p),
        })),
      ),
      registrarMovimientoCaja(tenantId, venta.id, session.user.id, sucursalId),
      registrarMovimientoCuenta(tenantId, venta.id, session.user.id),
      registrarMovimientosCredito(tenantId, venta.id, session.user.id),
      // Fiado: crea la cuenta por cobrar (solo por el monto en crédito).
      tieneFiado && v.cliente_id
        ? supabase.from("mm_fiados").insert({
            tenant_id: tenantId,
            cliente_id: v.cliente_id,
            venta_id: venta.id,
            monto_usd: v.pagos.find((p) => p.metodo === "fiado")?.monto ?? totalUsd,
            estado: "abierto",
          })
        : Promise.resolve(null),
      // Descuenta el stock con movimientos append-only (salida).
      supabase.from("mm_movimientos_inventario").insert(
        items.map((l) => ({
          tenant_id: tenantId,
          producto_id: l.producto_id,
          sucursal_id: sucursalId,
          tipo: "salida" as const,
          cantidad: -Math.abs(l.cantidad),
          motivo: "Venta",
          referencia: venta.id,
          usuario_id: session.user.id,
        })),
      ),
    ]);

    if (itemsRes.error) {
      console.error("[registrarVenta] error al insertar mm_ventas_items:", itemsRes.error);
      return { error: `Error al guardar los productos: ${itemsRes.error.message}` };
    }
    if (pagosRes.error) {
      console.error("[registrarVenta] error al insertar mm_pagos_venta:", pagosRes.error);
      return { error: `Error al guardar los pagos: ${pagosRes.error.message}` };
    }

    revalidatePath("/minimarket/ventas");
    revalidatePath("/minimarket");

    return { ok: true, ventaId: venta.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error inesperado al registrar la venta.";
    return { error: msg };
  }
}

// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();

export interface VentaParaAnularAction {
  ok?: boolean;
  error?: string;
  venta?: VentaParaAnular;
  metodosPago?: MetodoPagoConfigItem[];
  cuentasBancarias?: MmCuentaBancaria[];
  cajaAbierta?: boolean;
  locale?: string;
}

/**
 * Todo lo que necesita el modal de anulación+devolución, en un solo viaje —
 * se pide recién cuando el cajero abre el modal (no en cada fila del
 * historial de ventas). Mismo permiso que la anulación real, para no
 * mostrarle a quien no puede anular datos de fiado/devolución.
 */
export async function getVentaParaAnularAction(ventaId: string): Promise<VentaParaAnularAction> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { error: "Sesión no válida. Vuelve a iniciar sesión." };

  if (!uuidSchema.safeParse(ventaId).success) return { error: "Identificador de venta inválido." };

  const supabase = await createClient();
  const permisoError = await requirePermisoAccion(
    supabase,
    tenantId,
    session.user.id,
    "ventas",
    "eliminar",
  );
  if (permisoError) return { error: permisoError };

  const country = getCountryConfig(session.activeTenant?.country);

  const { data: ventaSucursal } = await supabase
    .from("mm_ventas")
    .select("sucursal_id")
    .eq("tenant_id", tenantId)
    .eq("id", ventaId)
    .maybeSingle();

  const [venta, cajaSesion, cuentasBancarias, configRes] = await Promise.all([
    getVentaParaAnular(supabase, tenantId, ventaId),
    ventaSucursal
      ? getSesionAbierta(supabase, tenantId, ventaSucursal.sucursal_id)
      : Promise.resolve(null),
    listCuentasBancarias(supabase, tenantId),
    supabase
      .from("mm_config_negocio")
      .select("metodos_pago")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  if (!venta) return { error: "Venta no encontrada." };

  return {
    ok: true,
    venta,
    metodosPago: parseMetodosPago(configRes.data?.metodos_pago),
    cuentasBancarias: cuentasBancarias.filter((c) => c.activa),
    cajaAbierta: Boolean(cajaSesion),
    locale: country.locale,
  };
}

export interface ReciboVentaAction {
  ok?: boolean;
  error?: string;
  doc?: DocumentoFiscal;
  fecha?: string;
}

/**
 * Recibo de una venta puntual — mismo documento que `/minimarket/ventas/[id]/recibo`
 * (`getVentaParaRecibo`, reutilizado sin cambios), pero servible desde un modal
 * (ej. la cuenta de fiado de un cliente) sin navegar a esa página. Igual
 * criterio de acceso que la página existente: cualquiera con sesión en el
 * tenant puede ver un recibo, sin permiso granular adicional.
 */
export async function obtenerReciboVentaAction(ventaId: string): Promise<ReciboVentaAction> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { error: "Sesión no válida. Vuelve a iniciar sesión." };

  if (!uuidSchema.safeParse(ventaId).success) return { error: "Identificador de venta inválido." };

  const supabase = await createClient();
  const [doc, tz] = await Promise.all([
    getVentaParaRecibo(supabase, tenantId, ventaId),
    getTimezoneNegocio(supabase, tenantId),
  ]);
  if (!doc) return { error: "No se encontró el recibo de esta venta." };

  return { ok: true, doc, fecha: fmtFechaHora(doc.fecha, tz) };
}

/** Anula una venta completada desde la UI — valida la sesión y el id. */
export async function anularVentaAction(
  ventaId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { error: "Sesión no válida. Vuelve a iniciar sesión." };

  if (!uuidSchema.safeParse(ventaId).success) return { error: "Identificador de venta inválido." };

  const supabase = await createClient();
  const permisoError = await requirePermisoAccion(
    supabase,
    tenantId,
    session.user.id,
    "ventas",
    "eliminar",
  );
  if (permisoError) return { error: permisoError };

  const result = await anularVenta(supabase, tenantId, ventaId);

  if (result.ok) {
    revalidatePath("/minimarket/ventas");
    revalidatePath("/minimarket");
  }

  return result;
}

const devolucionSchema = z
  .object({
    metodo: z.enum(
      ["efectivo_bs", "efectivo_usd", "pago_movil", "transferencia", "tarjeta", "zelle"] as const,
      { errorMap: () => ({ message: "Método de devolución inválido." }) },
    ),
    cuenta_bancaria_id: z.string().uuid().optional(),
    monto: z.coerce.number().positive("El monto a devolver debe ser mayor a cero."),
  })
  .nullable();

/**
 * Anula una venta y, si hubo dinero real de por medio, registra su
 * devolución como egreso nuevo en Caja o en la cuenta bancaria elegida —
 * mismo permiso que `anularVentaAction` (reutiliza `ventas.eliminar`, ver
 * CLAUDE.md/plan: anular ya solo lo hacen dueño/administrador por defecto).
 */
export async function anularVentaConDevolucionAction(
  ventaId: string,
  devolucionRaw: { metodo: string; cuenta_bancaria_id?: string; monto: number } | null,
): Promise<{ ok?: boolean; error?: string; devolucionFallida?: boolean }> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { error: "Sesión no válida. Vuelve a iniciar sesión." };

  if (!uuidSchema.safeParse(ventaId).success) return { error: "Identificador de venta inválido." };

  const parsed = devolucionSchema.safeParse(devolucionRaw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const permisoError = await requirePermisoAccion(
    supabase,
    tenantId,
    session.user.id,
    "ventas",
    "eliminar",
  );
  if (permisoError) return { error: permisoError };

  const devolucion = parsed.data
    ? {
        metodo: parsed.data.metodo as MmMetodoPago,
        cuentaBancariaId: parsed.data.cuenta_bancaria_id ?? null,
        monto: parsed.data.monto,
      }
    : null;

  const result = await anularVentaConDevolucion(
    supabase,
    tenantId,
    ventaId,
    session.user.id,
    devolucion,
  );

  if (result.ok) {
    revalidatePath("/minimarket/ventas");
    revalidatePath(`/minimarket/ventas/${ventaId}`);
    revalidatePath("/minimarket");
    revalidatePath("/minimarket/caja");
    revalidatePath("/minimarket/bancos", "layout");
  }

  return result;
}
