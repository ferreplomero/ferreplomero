"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createServiceClient } from "@arkiteq/db/service";
import type { MmMetodoPago } from "@arkiteq/db";
import { getTasaVigente } from "@/lib/minimarket/exchange-rate";
import { calcularPedidoPublico, type TotalesPedido } from "@/lib/minimarket/pedidos/calculo";
import {
  cargarProductosParaPedido,
  configImpuestosDe,
  getMetodosDisponibles,
  METODOS_LOCAL,
  METODOS_ONLINE,
  resolverCatalogo,
} from "@/lib/minimarket/pedidos/publico";
import { rutaEstadoPedido } from "@/lib/minimarket/pedidos/link";

const itemsSchema = z
  .array(
    z.object({
      producto_id: z.string().uuid(),
      cantidad: z.coerce.number().positive().max(10000),
    }),
  )
  .min(1, "Tu carrito está vacío.")
  .max(100, "El pedido tiene demasiados productos.");

const metodoSchema = z.enum([...new Set([...METODOS_ONLINE, ...METODOS_LOCAL])] as [
  MmMetodoPago,
  ...MmMetodoPago[],
]);

export type CotizacionResult =
  | ({ ok: true } & Omit<TotalesPedido, "lineas"> & {
        lineas: { producto_id: string; cantidad: number; totalUsd: number }[];
      })
  | { ok: false; error: string };

/** Recalcula el pedido en el servidor (precios reales, IVA e IGTF del método). */
async function calcular(slug: string, rawItems: unknown, metodo: MmMetodoPago | null) {
  const service = createServiceClient();
  const catalogo = await resolverCatalogo(service, slug);
  if (!catalogo) return { error: "Este catálogo no está disponible." } as const;
  const items = itemsSchema.safeParse(rawItems);
  if (!items.success)
    return { error: items.error.issues[0]?.message ?? "Pedido inválido." } as const;

  const [productos, tasa, configRes] = await Promise.all([
    cargarProductosParaPedido(
      service,
      catalogo.tenantId,
      catalogo.sucursalId,
      items.data.map((i) => i.producto_id),
    ),
    getTasaVigente(service, catalogo.tenantId),
    service
      .from("mm_config_negocio")
      .select("parametros, metodos_pago")
      .eq("tenant_id", catalogo.tenantId)
      .maybeSingle(),
  ]);
  const r = calcularPedidoPublico({
    items: items.data,
    productos,
    metodo,
    tasa: tasa?.valor ?? 0,
    config: configImpuestosDe(configRes.data?.parametros),
  });
  return { service, catalogo, items: items.data, r, metodosPagoRaw: configRes.data?.metodos_pago };
}

export async function cotizarPedido(
  slug: string,
  rawItems: unknown,
  rawMetodo: unknown,
): Promise<CotizacionResult> {
  try {
    const metodo = rawMetodo === null ? null : metodoSchema.safeParse(rawMetodo);
    if (metodo && !metodo.success) return { ok: false, error: "Método de pago inválido." };
    const c = await calcular(slug, rawItems, metodo ? metodo.data : null);
    if ("error" in c) return { ok: false, error: c.error ?? "Pedido inválido." };
    if (!c.r.ok) return { ok: false, error: c.r.error };
    const { lineas, ok: _ok, ...totales } = c.r;
    return {
      ok: true,
      ...totales,
      lineas: lineas.map((l) => ({
        producto_id: l.producto_id,
        cantidad: l.cantidad,
        totalUsd: l.totalUsd,
      })),
    };
  } catch (e) {
    console.error("[cotizarPedido]", e);
    return { ok: false, error: "No se pudo calcular el pedido. Intenta de nuevo." };
  }
}

const TIPOS_COMPROBANTE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_COMPROBANTE = 5 * 1024 * 1024;

/** Verifica la firma real del archivo (no basta con el mime que manda el navegador). */
function firmaImagenValida(buf: Uint8Array, mime: string): boolean {
  if (mime === "image/jpeg") return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (mime === "image/png")
    return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (mime === "image/webp") {
    const txt = (a: number, b: number) => String.fromCharCode(...buf.slice(a, b));
    return txt(0, 4) === "RIFF" && txt(8, 12) === "WEBP";
  }
  return false;
}

const pedidoSchema = z.object({
  slug: z.string().min(3).max(80),
  cliente_nombre: z.string().trim().min(2, "Escribe tu nombre.").max(120),
  cliente_telefono: z
    .string()
    .trim()
    .regex(/^[+\d][\d\s-]{6,29}$/, "Escribe un teléfono válido."),
  forma_pago: z.enum(["online", "local"]),
  metodo: metodoSchema,
  cuenta_bancaria_id: z.string().uuid().nullable(),
  monto_entregado: z.coerce.number().nonnegative().max(1e12).nullable(),
  items: z.string().max(20000),
  // Trampa para bots: un humano nunca llena este campo (oculto en la UI).
  web: z.string().max(0).optional(),
});

export type CrearPedidoResult = { ok: true; ruta: string } | { ok: false; error: string };

/**
 * Crea un pedido (NO toca stock ni dinero). Todo se recalcula en el servidor;
 * el pedido se inserta con service_role porque no existe policy de insert
 * para nadie (ver migración 0119).
 */
export async function crearPedidoPublico(formData: FormData): Promise<CrearPedidoResult> {
  let comprobantePath: string | null = null;
  const service = createServiceClient();
  try {
    const montoRaw = formData.get("monto_entregado");
    const parsed = pedidoSchema.safeParse({
      slug: formData.get("slug"),
      cliente_nombre: formData.get("cliente_nombre"),
      cliente_telefono: formData.get("cliente_telefono"),
      forma_pago: formData.get("forma_pago"),
      metodo: formData.get("metodo"),
      cuenta_bancaria_id: formData.get("cuenta_bancaria_id") || null,
      monto_entregado: montoRaw ? String(montoRaw).replace(",", ".") : null,
      items: formData.get("items"),
      web: formData.get("web") ?? undefined,
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos del pedido inválidos." };
    }
    const v = parsed.data;

    let rawItems: unknown;
    try {
      rawItems = JSON.parse(v.items);
    } catch {
      return { ok: false, error: "Pedido inválido." };
    }

    const c = await calcular(v.slug, rawItems, v.metodo);
    if ("error" in c) return { ok: false, error: c.error ?? "Pedido inválido." };
    if (!c.r.ok) return { ok: false, error: c.r.error };
    const { catalogo, r } = c;

    // El método debe ser válido para la forma de pago y estar activo en el negocio.
    const disponibles = await getMetodosDisponibles(service, catalogo.tenantId, c.metodosPagoRaw);
    let cuentaId: string | null = null;
    if (v.forma_pago === "online") {
      const m = disponibles.online.find((o) => o.metodo === v.metodo);
      if (!m) return { ok: false, error: "Ese método de pago no está disponible." };
      const cuenta = m.cuentas.find((cu) => cu.id === v.cuenta_bancaria_id) ?? m.cuentas[0];
      if (!cuenta) return { ok: false, error: "Ese método de pago no está disponible." };
      cuentaId = cuenta.id;
    } else if (!(disponibles.local as readonly string[]).includes(v.metodo)) {
      return { ok: false, error: "Ese método de pago no está disponible." };
    }

    const esEfectivo = v.metodo === "efectivo_bs" || v.metodo === "efectivo_usd";
    const montoEntregado = v.forma_pago === "local" && esEfectivo ? v.monto_entregado : null;
    if (montoEntregado !== null) {
      const total = v.metodo === "efectivo_usd" ? r.totalUsd : r.totalBs;
      if (montoEntregado > 0 && montoEntregado < total) {
        return { ok: false, error: "El monto con el que vas a pagar no cubre el total." };
      }
    }

    // Comprobante obligatorio al pagar ahora.
    if (v.forma_pago === "online") {
      const archivo = formData.get("comprobante");
      if (!(archivo instanceof File) || archivo.size === 0) {
        return { ok: false, error: "Adjunta la imagen del comprobante de pago." };
      }
      const ext = TIPOS_COMPROBANTE[archivo.type];
      if (!ext) return { ok: false, error: "El comprobante debe ser una imagen JPG, PNG o WebP." };
      if (archivo.size > MAX_COMPROBANTE) {
        return { ok: false, error: "El comprobante no puede pesar más de 5 MB." };
      }
      const buf = new Uint8Array(await archivo.arrayBuffer());
      if (!firmaImagenValida(buf, archivo.type)) {
        return { ok: false, error: "El comprobante debe ser una imagen JPG, PNG o WebP." };
      }
      const path = `${catalogo.tenantId}/pedidos-publicos/${randomUUID()}.${ext}`;
      const { error: upErr } = await service.storage
        .from("comprobantes-pedidos-publicos")
        .upload(path, buf, { contentType: archivo.type, upsert: false });
      if (upErr) {
        console.error("[crearPedidoPublico] subida comprobante:", upErr);
        return { ok: false, error: "No se pudo subir el comprobante. Intenta de nuevo." };
      }
      comprobantePath = path;
    }

    // Correlativo por tenant; ante choque (dos pedidos simultáneos) se reintenta.
    let pedidoId: string | null = null;
    for (let intento = 0; intento < 5 && !pedidoId; intento++) {
      const { data: ultimo } = await service
        .from("mm_pedidos_publicos")
        .select("numero")
        .eq("tenant_id", catalogo.tenantId)
        .order("numero", { ascending: false })
        .limit(1)
        .maybeSingle();
      const numero = (ultimo?.numero ?? 0) + 1;
      const { data, error } = await service
        .from("mm_pedidos_publicos")
        .insert({
          tenant_id: catalogo.tenantId,
          sucursal_id: catalogo.sucursalId,
          numero,
          cliente_nombre: v.cliente_nombre,
          cliente_telefono: v.cliente_telefono,
          forma_pago: v.forma_pago,
          metodo_pago_elegido: v.metodo,
          cuenta_bancaria_id: cuentaId,
          comprobante_path: comprobantePath,
          monto_entregado: montoEntregado,
          subtotal_usd: r.subtotalUsd,
          iva_usd: r.ivaUsd,
          igtf_usd: r.igtfUsd,
          total_usd: r.totalUsd,
          total_bs: r.totalBs,
          tasa_usada: r.tasa,
          estado: v.forma_pago === "online" ? "pago_reportado" : "pendiente",
        })
        .select("id")
        .single();
      if (data) pedidoId = data.id;
      else if (error?.code !== "23505") throw error ?? new Error("insert sin datos");
    }
    if (!pedidoId) throw new Error("No se pudo asignar número al pedido.");

    const { error: itemsErr } = await service.from("mm_pedidos_publicos_items").insert(
      r.lineas.map((l) => ({
        tenant_id: catalogo.tenantId,
        pedido_id: pedidoId,
        producto_id: l.producto_id,
        producto_nombre: l.nombre,
        cantidad: l.cantidad,
        precio_usd: l.precioUsd,
        total_usd: l.totalUsd,
      })),
    );
    if (itemsErr) {
      await service.from("mm_pedidos_publicos").delete().eq("id", pedidoId);
      throw itemsErr;
    }

    return {
      ok: true,
      ruta: `${rutaEstadoPedido(catalogo.slug, pedidoId, catalogo.tenantId)}?nuevo=1`,
    };
  } catch (e) {
    console.error("[crearPedidoPublico]", e);
    if (comprobantePath) {
      await service.storage.from("comprobantes-pedidos-publicos").remove([comprobantePath]);
    }
    return { ok: false, error: "No se pudo registrar el pedido. Intenta de nuevo." };
  }
}
