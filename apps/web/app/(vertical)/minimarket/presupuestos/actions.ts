"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { requirePermisoAccion } from "@/lib/minimarket/permisos";
import { getTasaVigente, getTipoPreferido } from "@/lib/minimarket/exchange-rate";
import {
  siguienteNumeroPresupuesto,
  numeroPresupuestoDisponible,
  PREFIJO_NUMERO_PRESUPUESTO,
  getPresupuestoDetalle,
} from "@/lib/minimarket/data/presupuestos";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";

const PRESUPUESTOS_PATH = "/minimarket/presupuestos";
const redondear = (n: number) => Math.round(n * 100) / 100;
const REGEX_NUMERO_VALIDO = new RegExp(`^${PREFIJO_NUMERO_PRESUPUESTO}\\d{6,}$`);

export interface PresupuestoResult {
  ok?: boolean;
  presupuestoId?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export interface ConversionResult {
  ok?: boolean;
  redirectTo?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const itemSchema = z.object({
  producto_id: z.string().uuid(),
  cantidad: z.number().positive("La cantidad debe ser mayor a cero."),
  precio_unitario_usd: z.number().nonnegative("El precio no puede ser negativo."),
});

const presupuestoSchema = z.object({
  sucursal_id: z.string().uuid(),
  cliente_id: z.string().uuid().nullable().optional(),
  cliente_nombre_manual: z.string().trim().max(120).optional().or(z.literal("")),
  cliente_cedula_manual: z.string().trim().max(30).optional().or(z.literal("")),
  cliente_telefono_manual: z.string().trim().max(30).optional().or(z.literal("")),
  validez_hasta: z.string().min(1, "Define hasta cuándo es válido el presupuesto."),
  notas: z.string().trim().max(1000).optional().or(z.literal("")),
  items: z.array(itemSchema).min(1, "Agrega al menos un producto."),
});

function toNull(v: string | undefined): string | null {
  return v && v.length > 0 ? v : null;
}

function parseItemsJson(raw: FormDataEntryValue | null): unknown[] | null {
  try {
    const parsed = JSON.parse(typeof raw === "string" ? raw : "[]");
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

interface DatosPresupuesto {
  sucursal_id: string;
  cliente_id: string | null;
  cliente_nombre_manual: string | null;
  cliente_cedula_manual: string | null;
  cliente_telefono_manual: string | null;
  validez_hasta: string;
  notas: string | null;
  items: { producto_id: string; cantidad: number; precio_unitario_usd: number }[];
}

function parseFormulario(formData: FormData): DatosPresupuesto | { error: string } {
  const itemsRaw = parseItemsJson(formData.get("items_json"));
  if (!itemsRaw) return { error: "Los productos del presupuesto son inválidos." };

  const itemsValidation = z
    .array(itemSchema)
    .min(1, "Agrega al menos un producto.")
    .safeParse(
      itemsRaw.map((i) => {
        const obj = i as Record<string, unknown>;
        return {
          producto_id: obj.producto_id,
          cantidad: Number(obj.cantidad),
          precio_unitario_usd: Number(obj.precio_unitario_usd),
        };
      }),
    );
  if (!itemsValidation.success) {
    return { error: itemsValidation.error.issues[0]?.message ?? "Productos inválidos." };
  }

  const parsed = presupuestoSchema.safeParse({
    sucursal_id: formData.get("sucursal_id"),
    cliente_id: formData.get("cliente_id") || null,
    cliente_nombre_manual: formData.get("cliente_nombre_manual") ?? "",
    cliente_cedula_manual: formData.get("cliente_cedula_manual") ?? "",
    cliente_telefono_manual: formData.get("cliente_telefono_manual") ?? "",
    validez_hasta: formData.get("validez_hasta"),
    notas: formData.get("notas") ?? "",
    items: itemsValidation.data,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const d = parsed.data;
  return {
    sucursal_id: d.sucursal_id,
    cliente_id: d.cliente_id ?? null,
    cliente_nombre_manual: toNull(d.cliente_nombre_manual),
    cliente_cedula_manual: toNull(d.cliente_cedula_manual),
    cliente_telefono_manual: toNull(d.cliente_telefono_manual),
    validez_hasta: d.validez_hasta,
    notas: toNull(d.notas),
    items: d.items,
  };
}

// ---------------------------------------------------------------------------
// Crear
// ---------------------------------------------------------------------------

export async function crearPresupuesto(
  _prev: PresupuestoResult,
  formData: FormData,
): Promise<PresupuestoResult> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { error: "Sesión no válida." };

  const supabase = await createClient();
  const permisoError = await requirePermisoAccion(
    supabase,
    tenantId,
    session.user.id,
    "presupuestos",
    "crear",
  );
  if (permisoError) return { error: permisoError };

  const datos = parseFormulario(formData);
  if ("error" in datos) return { error: datos.error };

  const productoIds = [...new Set(datos.items.map((i) => i.producto_id))];
  const [{ data: productos, error: prodError }, tasa, tipoTasa, configRes] = await Promise.all([
    supabase
      .from("mm_productos")
      .select("id, nombre, precio_usd")
      .eq("tenant_id", tenantId)
      .in("id", productoIds),
    getTasaVigente(supabase, tenantId),
    getTipoPreferido(supabase, tenantId),
    supabase.from("mm_config_negocio").select("parametros").eq("tenant_id", tenantId).maybeSingle(),
  ]);

  if (prodError) return { error: "No se pudieron validar los productos." };
  if (!tasa) return { error: "Define la tasa del día antes de crear un presupuesto." };

  const productoMap = new Map((productos ?? []).map((p) => [p.id, p]));

  const params = (configRes.data?.parametros as Record<string, unknown>) ?? {};
  const ivaActivo = Boolean(params.iva_activo ?? false);
  const ivaPct = Number(params.iva_pct ?? 16);

  const itemsParaGuardar: {
    tenant_id: string;
    producto_id: string;
    descripcion: string;
    cantidad: number;
    precio_lista_usd: number;
    precio_unitario_usd: number;
    precio_ajustado: boolean;
    subtotal_usd: number;
  }[] = [];
  for (const item of datos.items) {
    const producto = productoMap.get(item.producto_id);
    if (!producto) {
      return { error: "Uno de los productos ya no existe. Vuelve a armar el presupuesto." };
    }
    const precioLista = Number(producto.precio_usd);
    itemsParaGuardar.push({
      tenant_id: tenantId,
      producto_id: item.producto_id,
      descripcion: producto.nombre,
      cantidad: item.cantidad,
      precio_lista_usd: precioLista,
      precio_unitario_usd: item.precio_unitario_usd,
      precio_ajustado: Math.abs(precioLista - item.precio_unitario_usd) > 0.001,
      subtotal_usd: redondear(item.cantidad * item.precio_unitario_usd),
    });
  }

  const subtotalUsd = redondear(itemsParaGuardar.reduce((s, i) => s + i.subtotal_usd, 0));
  const ivaUsd = ivaActivo && ivaPct > 0 ? redondear((subtotalUsd * ivaPct) / 100) : 0;
  const totalUsd = redondear(subtotalUsd + ivaUsd);
  const totalBs = redondear(totalUsd * tasa.valor);

  // Número editable: el usuario ve y puede ajustar el número sugerido en el
  // formulario (ver `presupuesto-form.tsx`) — permite continuar una
  // numeración que ya traían de otro sistema. Si no llega ninguno (ej. envío
  // directo sin JS), se recurre al mismo cálculo automático como respaldo.
  const numeroCrudo = String(formData.get("numero") ?? "").trim();
  let numero: string;
  if (numeroCrudo) {
    if (!REGEX_NUMERO_VALIDO.test(numeroCrudo)) {
      return {
        error: `El número debe tener el formato ${PREFIJO_NUMERO_PRESUPUESTO}000000.`,
      };
    }
    if (!(await numeroPresupuestoDisponible(supabase, tenantId, numeroCrudo))) {
      return { error: `Ya existe un presupuesto con el número ${numeroCrudo}. Elige otro.` };
    }
    numero = numeroCrudo;
  } else {
    numero = await siguienteNumeroPresupuesto(supabase, tenantId);
  }

  const { data: presupuesto, error: insertError } = await supabase
    .from("mm_presupuestos")
    .insert({
      tenant_id: tenantId,
      sucursal_id: datos.sucursal_id,
      numero,
      cliente_id: datos.cliente_id,
      cliente_nombre_manual: datos.cliente_id ? null : datos.cliente_nombre_manual,
      cliente_cedula_manual: datos.cliente_id ? null : datos.cliente_cedula_manual,
      cliente_telefono_manual: datos.cliente_id ? null : datos.cliente_telefono_manual,
      validez_hasta: datos.validez_hasta,
      tasa_tipo: tipoTasa,
      tasa_usada: tasa.valor,
      subtotal_usd: subtotalUsd,
      iva_usd: ivaUsd,
      total_usd: totalUsd,
      total_bs: totalBs,
      notas: datos.notas,
      usuario_id: session.user.id,
    })
    .select("id")
    .single();

  if (insertError || !presupuesto) {
    // 23505 = viola el índice único (tenant_id, numero) — puede pasar si dos
    // personas crean un presupuesto con el mismo número manual casi a la vez
    // (la validación de arriba ya lo evita en el caso normal; esto es el
    // respaldo de la base de datos para la carrera entre ambas peticiones).
    if (insertError?.code === "23505") {
      return { error: `Ya existe un presupuesto con el número ${numero}. Elige otro.` };
    }
    return { error: "No se pudo crear el presupuesto. Inténtalo de nuevo." };
  }

  const { error: itemsError } = await supabase
    .from("mm_presupuestos_items")
    .insert(itemsParaGuardar.map((i) => ({ ...i, presupuesto_id: presupuesto.id })));

  if (itemsError) {
    await supabase.from("mm_presupuestos").delete().eq("id", presupuesto.id);
    return { error: "No se pudieron guardar los productos del presupuesto." };
  }

  revalidatePath(PRESUPUESTOS_PATH);
  return { ok: true, presupuestoId: presupuesto.id };
}

// ---------------------------------------------------------------------------
// Editar
// ---------------------------------------------------------------------------

export async function actualizarPresupuesto(
  presupuestoId: string,
  _prev: PresupuestoResult,
  formData: FormData,
): Promise<PresupuestoResult> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { error: "Sesión no válida." };

  const supabase = await createClient();
  const permisoError = await requirePermisoAccion(
    supabase,
    tenantId,
    session.user.id,
    "presupuestos",
    "editar",
  );
  if (permisoError) return { error: permisoError };

  const { data: actual } = await supabase
    .from("mm_presupuestos")
    .select("estado")
    .eq("id", presupuestoId)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!actual) return { error: "Presupuesto no encontrado." };
  if (actual.estado !== "pendiente") {
    return { error: "Solo se puede editar un presupuesto pendiente." };
  }

  const datos = parseFormulario(formData);
  if ("error" in datos) return { error: datos.error };

  const productoIds = [...new Set(datos.items.map((i) => i.producto_id))];
  const [{ data: productos, error: prodError }, configRes] = await Promise.all([
    supabase
      .from("mm_productos")
      .select("id, nombre, precio_usd")
      .eq("tenant_id", tenantId)
      .in("id", productoIds),
    supabase.from("mm_config_negocio").select("parametros").eq("tenant_id", tenantId).maybeSingle(),
  ]);

  if (prodError) return { error: "No se pudieron validar los productos." };

  const productoMap = new Map((productos ?? []).map((p) => [p.id, p]));

  const params = (configRes.data?.parametros as Record<string, unknown>) ?? {};
  const ivaActivo = Boolean(params.iva_activo ?? false);
  const ivaPct = Number(params.iva_pct ?? 16);

  const itemsParaGuardar: {
    tenant_id: string;
    presupuesto_id: string;
    producto_id: string;
    descripcion: string;
    cantidad: number;
    precio_lista_usd: number;
    precio_unitario_usd: number;
    precio_ajustado: boolean;
    subtotal_usd: number;
  }[] = [];
  for (const item of datos.items) {
    const producto = productoMap.get(item.producto_id);
    if (!producto) {
      return { error: "Uno de los productos ya no existe. Vuelve a armar el presupuesto." };
    }
    const precioLista = Number(producto.precio_usd);
    itemsParaGuardar.push({
      tenant_id: tenantId,
      presupuesto_id: presupuestoId,
      producto_id: item.producto_id,
      descripcion: producto.nombre,
      cantidad: item.cantidad,
      precio_lista_usd: precioLista,
      precio_unitario_usd: item.precio_unitario_usd,
      precio_ajustado: Math.abs(precioLista - item.precio_unitario_usd) > 0.001,
      subtotal_usd: redondear(item.cantidad * item.precio_unitario_usd),
    });
  }

  const subtotalUsd = redondear(itemsParaGuardar.reduce((s, i) => s + i.subtotal_usd, 0));
  const ivaUsd = ivaActivo && ivaPct > 0 ? redondear((subtotalUsd * ivaPct) / 100) : 0;
  const totalUsd = redondear(subtotalUsd + ivaUsd);

  const { data: presupuesto } = await supabase
    .from("mm_presupuestos")
    .select("tasa_usada")
    .eq("id", presupuestoId)
    .single();
  const totalBs = redondear(totalUsd * Number(presupuesto?.tasa_usada ?? 0));

  const { error: updateError } = await supabase
    .from("mm_presupuestos")
    .update({
      sucursal_id: datos.sucursal_id,
      cliente_id: datos.cliente_id,
      cliente_nombre_manual: datos.cliente_id ? null : datos.cliente_nombre_manual,
      cliente_cedula_manual: datos.cliente_id ? null : datos.cliente_cedula_manual,
      cliente_telefono_manual: datos.cliente_id ? null : datos.cliente_telefono_manual,
      validez_hasta: datos.validez_hasta,
      subtotal_usd: subtotalUsd,
      iva_usd: ivaUsd,
      total_usd: totalUsd,
      total_bs: totalBs,
      notas: datos.notas,
      updated_at: new Date().toISOString(),
    })
    .eq("id", presupuestoId)
    .eq("tenant_id", tenantId);

  if (updateError) return { error: "No se pudo actualizar el presupuesto." };

  // Reemplaza los ítems por completo (mismo criterio simple que un formulario
  // de edición que reenvía el carrito completo, no un diff por línea).
  await supabase.from("mm_presupuestos_items").delete().eq("presupuesto_id", presupuestoId);
  const { error: itemsError } = await supabase
    .from("mm_presupuestos_items")
    .insert(itemsParaGuardar);
  if (itemsError) return { error: "No se pudieron guardar los productos del presupuesto." };

  revalidatePath(PRESUPUESTOS_PATH);
  revalidatePath(`${PRESUPUESTOS_PATH}/${presupuestoId}`);
  return { ok: true, presupuestoId };
}

// ---------------------------------------------------------------------------
// Eliminar / Rechazar / Duplicar
// ---------------------------------------------------------------------------

export async function eliminarPresupuesto(presupuestoId: string): Promise<PresupuestoResult> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { error: "Sesión no válida." };

  const supabase = await createClient();
  const permisoError = await requirePermisoAccion(
    supabase,
    tenantId,
    session.user.id,
    "presupuestos",
    "eliminar",
  );
  if (permisoError) return { error: permisoError };

  const { data: actual } = await supabase
    .from("mm_presupuestos")
    .select("estado")
    .eq("id", presupuestoId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!actual) return { error: "Presupuesto no encontrado." };
  if (actual.estado === "convertido") {
    return { error: "No se puede eliminar un presupuesto ya convertido en venta." };
  }

  const { error } = await supabase
    .from("mm_presupuestos")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", presupuestoId)
    .eq("tenant_id", tenantId);

  if (error) return { error: "No se pudo eliminar el presupuesto." };

  revalidatePath(PRESUPUESTOS_PATH);
  return { ok: true };
}

/**
 * Marca un presupuesto como rechazado (el cliente no aceptó). Solo exige
 * `presupuestos.crear`, no `editar`: registrar la respuesta del cliente es
 * parte natural de cotizar, igual que el cajero completa una venta sin
 * necesitar permiso de edición.
 */
export async function rechazarPresupuesto(presupuestoId: string): Promise<PresupuestoResult> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { error: "Sesión no válida." };

  const supabase = await createClient();
  const permisoError = await requirePermisoAccion(
    supabase,
    tenantId,
    session.user.id,
    "presupuestos",
    "crear",
  );
  if (permisoError) return { error: permisoError };

  const { data: actual } = await supabase
    .from("mm_presupuestos")
    .select("estado")
    .eq("id", presupuestoId)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!actual) return { error: "Presupuesto no encontrado." };
  if (actual.estado !== "pendiente") {
    return { error: "Solo se puede rechazar un presupuesto pendiente." };
  }

  const { error } = await supabase
    .from("mm_presupuestos")
    .update({ estado: "rechazado", updated_at: new Date().toISOString() })
    .eq("id", presupuestoId)
    .eq("tenant_id", tenantId);

  if (error) return { error: "No se pudo rechazar el presupuesto." };

  revalidatePath(PRESUPUESTOS_PATH);
  revalidatePath(`${PRESUPUESTOS_PATH}/${presupuestoId}`);
  return { ok: true };
}

/** Crea una copia nueva (pendiente, numeración nueva, tasa/fecha del día) de un presupuesto existente. */
export async function duplicarPresupuesto(presupuestoId: string): Promise<PresupuestoResult> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { error: "Sesión no válida." };

  const supabase = await createClient();
  const permisoError = await requirePermisoAccion(
    supabase,
    tenantId,
    session.user.id,
    "presupuestos",
    "crear",
  );
  if (permisoError) return { error: permisoError };

  const tz = await getTimezoneNegocio(supabase, tenantId);
  const original = await getPresupuestoDetalle(supabase, tenantId, presupuestoId, tz);
  if (!original) return { error: "Presupuesto no encontrado." };

  const [tasa, tipoTasa] = await Promise.all([
    getTasaVigente(supabase, tenantId),
    getTipoPreferido(supabase, tenantId),
  ]);
  if (!tasa) return { error: "Define la tasa del día antes de duplicar un presupuesto." };

  const totalUsd = original.totalUsd;
  const totalBs = redondear(totalUsd * tasa.valor);
  const validezDefault = new Date();
  validezDefault.setDate(validezDefault.getDate() + 7);

  const numero = await siguienteNumeroPresupuesto(supabase, tenantId);

  const { data: nuevo, error: insertError } = await supabase
    .from("mm_presupuestos")
    .insert({
      tenant_id: tenantId,
      sucursal_id: original.sucursalId,
      numero,
      cliente_id: original.clienteId,
      cliente_nombre_manual: original.clienteNombreManual,
      cliente_cedula_manual: original.clienteCedulaManual,
      cliente_telefono_manual: original.clienteTelefonoManual,
      validez_hasta: validezDefault.toISOString().slice(0, 10),
      tasa_tipo: tipoTasa,
      tasa_usada: tasa.valor,
      subtotal_usd: original.subtotalUsd,
      iva_usd: original.ivaUsd,
      total_usd: totalUsd,
      total_bs: totalBs,
      notas: original.notas,
      usuario_id: session.user.id,
    })
    .select("id")
    .single();

  if (insertError || !nuevo) return { error: "No se pudo duplicar el presupuesto." };

  const { error: itemsError } = await supabase.from("mm_presupuestos_items").insert(
    original.items.map((i) => ({
      tenant_id: tenantId,
      presupuesto_id: nuevo.id,
      producto_id: i.productoId,
      descripcion: i.descripcion,
      cantidad: i.cantidad,
      precio_lista_usd: i.precioListaUsd,
      precio_unitario_usd: i.precioUnitarioUsd,
      precio_ajustado: i.precioAjustado,
      subtotal_usd: i.subtotalUsd,
    })),
  );

  if (itemsError) {
    await supabase.from("mm_presupuestos").delete().eq("id", nuevo.id);
    return { error: "No se pudieron duplicar los productos del presupuesto." };
  }

  revalidatePath(PRESUPUESTOS_PATH);
  return { ok: true, presupuestoId: nuevo.id };
}

// ---------------------------------------------------------------------------
// Conversión en venta (ver CLAUDE.md — reutiliza el flujo de venta existente)
// ---------------------------------------------------------------------------

/**
 * Valida que el presupuesto pueda convertirse en venta y devuelve la URL del
 * POS con el carrito precargado. NO toca inventario, caja, bancos ni fiado —
 * eso ocurre en `registrarVenta` (ventas/actions.ts), sin ningún cambio,
 * cuando el cajero confirme el cobro en el POS.
 */
export async function prepararConversionPresupuesto(
  presupuestoId: string,
): Promise<ConversionResult> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { error: "Sesión no válida." };

  const supabase = await createClient();
  const permisoError = await requirePermisoAccion(
    supabase,
    tenantId,
    session.user.id,
    "presupuestos",
    "crear",
  );
  if (permisoError) return { error: permisoError };

  const tz = await getTimezoneNegocio(supabase, tenantId);
  const presupuesto = await getPresupuestoDetalle(supabase, tenantId, presupuestoId, tz);
  if (!presupuesto) return { error: "Presupuesto no encontrado." };

  if (presupuesto.estado !== "pendiente") {
    if (presupuesto.estado === "convertido") {
      return {
        error: presupuesto.ventaId
          ? "Este presupuesto ya fue convertido en venta."
          : "Este presupuesto quedó marcado como convertido pero no se pudo confirmar qué venta se generó (posible corte de conexión durante un intento anterior). Revisa el Historial de ventas antes de reintentar — si no encuentras la venta, duplica este presupuesto para generar uno nuevo.",
      };
    }
    return { error: "Este presupuesto fue rechazado y no se puede convertir." };
  }

  // Precios ajustados (mayoristas) viajan como `precio_usd_override` en la
  // venta -- registrarVenta descarta ese override EN SILENCIO si el usuario
  // no tiene el permiso `ventas.editar` (ver actions.ts de ventas) y cobra el
  // precio de catalogo. Sin esta validacion, un cajero sin ese permiso
  // convertiria el presupuesto pero el cliente terminaria pagando el precio
  // de catalogo en vez del precio pactado, sin que nadie se diera cuenta.
  const tieneAjustes = presupuesto.items.some((i) => i.precioAjustado);
  if (tieneAjustes) {
    const permisoAjuste = await requirePermisoAccion(
      supabase,
      tenantId,
      session.user.id,
      "ventas",
      "editar",
    );
    if (permisoAjuste) {
      return {
        error:
          "Este presupuesto tiene precios ajustados. Necesitas permiso de edición de ventas para convertirlo — pide a un supervisor o administrador.",
      };
    }
  }

  return { ok: true, redirectTo: `/minimarket/ventas/nueva?presupuestoId=${presupuestoId}` };
}

/**
 * Reserva ATÓMICAMENTE la conversión de un presupuesto ANTES de crear la
 * venta — se llama justo antes de `registrarVenta` en
 * `pos-cliente.tsx::confirmarVenta`. Transiciona `pendiente` → `convertido`
 * (sin `venta_id` todavía) solo si el presupuesto SIGUE pendiente en ese
 * instante; si dos pestañas/dispositivos intentan convertir el MISMO
 * presupuesto casi al mismo tiempo, la segunda `update ... where
 * estado='pendiente'` afecta 0 filas y se bloquea aquí, ANTES de llegar a
 * crear una segunda venta real (con su propio stock/cobro duplicado) — a
 * diferencia de la validación vieja, que solo revisaba el estado por fuera
 * (lectura + escritura separadas, no atómico) y llegaba tarde: la venta ya
 * existía para cuando se detectaba el conflicto.
 */
export async function reservarConversionPresupuesto(
  presupuestoId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { error: "Sesión no válida." };

  const supabase = await createClient();
  const permisoError = await requirePermisoAccion(
    supabase,
    tenantId,
    session.user.id,
    "presupuestos",
    "crear",
  );
  if (permisoError) return { error: permisoError };

  const { data, error } = await supabase
    .from("mm_presupuestos")
    .update({ estado: "convertido", updated_at: new Date().toISOString() })
    .eq("id", presupuestoId)
    .eq("tenant_id", tenantId)
    .eq("estado", "pendiente")
    .select("id")
    .maybeSingle();

  if (error) return { error: "No se pudo iniciar la conversión. Inténtalo de nuevo." };
  if (!data) {
    return {
      error:
        "Este presupuesto ya no está pendiente — puede que ya se haya convertido (en esta u otra sesión) o que haya sido rechazado. Actualiza la página para ver su estado actual.",
    };
  }
  return { ok: true };
}

/**
 * Revierte la reserva de `reservarConversionPresupuesto` cuando
 * `registrarVenta` devolvió un error CLARO (no una excepción de red): la
 * venta con toda certeza NO se creó, así que el presupuesto puede volver a
 * "pendiente" para que el cajero corrija y reintente. Nunca revierte si el
 * presupuesto ya quedó enlazado a una venta real (`venta_id` no nulo) — eso
 * significaría deshacer una conversión que sí ocurrió.
 */
export async function liberarReservaPresupuesto(presupuestoId: string): Promise<void> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return;

  const supabase = await createClient();
  await supabase
    .from("mm_presupuestos")
    .update({ estado: "pendiente", updated_at: new Date().toISOString() })
    .eq("id", presupuestoId)
    .eq("tenant_id", tenantId)
    .eq("estado", "convertido")
    .is("venta_id", null);
}

/**
 * Marca el presupuesto como convertido y lo enlaza con la venta ya creada.
 * Se llama DESPUÉS de que `registrarVenta` confirmó con éxito (ver
 * `pos-cliente.tsx::confirmarVenta`) — no crea la venta, no toca inventario,
 * caja, bancos ni fiado: eso ya ocurrió, sin cambios, dentro de esa función.
 * A esta altura el presupuesto ya está "convertido" gracias a
 * `reservarConversionPresupuesto` (llamada antes de `registrarVenta`); esta
 * función solo termina de enlazarlo con `venta_id`. Se deja tolerante a que
 * todavía esté "pendiente" (llamadas antiguas o rutas que no pasaron por la
 * reserva) para no romper ese camino.
 */
export async function marcarPresupuestoConvertido(
  presupuestoId: string,
  ventaId: string,
): Promise<PresupuestoResult> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { error: "Sesión no válida." };

  const supabase = await createClient();
  const { data: actual } = await supabase
    .from("mm_presupuestos")
    .select("estado, venta_id")
    .eq("id", presupuestoId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!actual) return { ok: false };
  // Ya enlazado a una venta (otra llamada ganó la carrera) — no pisar.
  if (actual.estado === "convertido" && actual.venta_id) return { ok: false };
  if (actual.estado !== "pendiente" && actual.estado !== "convertido") return { ok: false };

  const { error } = await supabase
    .from("mm_presupuestos")
    .update({ estado: "convertido", venta_id: ventaId, updated_at: new Date().toISOString() })
    .eq("id", presupuestoId)
    .eq("tenant_id", tenantId);

  if (error)
    return {
      error: "La venta se registró, pero no se pudo marcar el presupuesto como convertido.",
    };

  revalidatePath(PRESUPUESTOS_PATH);
  revalidatePath(`${PRESUPUESTOS_PATH}/${presupuestoId}`);
  return { ok: true };
}
