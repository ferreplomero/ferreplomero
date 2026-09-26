"use server";

/**
 * Ventas en espera COMPARTIDAS entre usuarios/dispositivos de la sucursal.
 *
 * El POS escribe las ventas en espera en local (PowerSync) y las sube solas
 * al servidor. Pero lo que cada dispositivo DESCARGA depende de las Sync
 * Rules de PowerSync (configuradas fuera del repo) — así que para que un
 * cajero vea las que dejó OTRO usuario, el panel "En espera" además las lee
 * aquí directo del servidor al abrirse/actualizarse y las combina con las
 * locales (ver `ventas-en-espera.tsx`).
 *
 * Retomar una ajena pasa por `reclamarVentaEnEsperaAction`: un UPDATE
 * condicional (`estado = 'en_espera'`) que solo gana UN dispositivo — evita
 * que dos cajeros retomen y cobren la misma venta a la vez.
 *
 * Nada de esto toca dinero: una venta en espera es un borrador (no descuenta
 * inventario ni mueve caja). Solo usa columnas que ya existían (0037/0038).
 */
import { z } from "zod";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { requirePermisoAccion } from "@/lib/minimarket/permisos";
import { sucursalesPermitidas } from "@/lib/minimarket/sucursal-acceso";
import { resolverEtiquetasUsuarios } from "@/lib/minimarket/usuario-etiqueta";
import type { VentaPendienteRow } from "@/lib/minimarket/powersync/ventas-pendientes-local";

/** Fila del servidor con el mismo formato que la local + quién la dejó. */
export interface VentaEnEsperaRemota extends VentaPendienteRow {
  usuario_nombre: string | null;
  usuario_rol: string | null;
}

export interface ListarVentasEnEsperaResult {
  ventas?: VentaEnEsperaRemota[];
  /** Nombre+rol de TODOS los usuarios que aparecen (también en filas solo locales). */
  etiquetas?: Record<string, { nombre: string; rol: string }>;
  error?: string;
}

const uuid = z.string().uuid();

async function contexto() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return null;
  const supabase = await createClient();
  return { session, tenantId, supabase };
}

async function puedeUsarSucursal(
  ctx: NonNullable<Awaited<ReturnType<typeof contexto>>>,
  sucursalId: string,
): Promise<boolean> {
  const permitidas = await sucursalesPermitidas(ctx.supabase, ctx.tenantId, ctx.session.user.id);
  return permitidas.some((s) => s.id === sucursalId);
}

/**
 * Ventas en espera de la sucursal guardadas en el servidor (de cualquier
 * usuario). `usuarioIdsExtra`: ids de filas que el panel ya tiene en local,
 * para devolver también su nombre/rol en una sola ida.
 */
export async function listarVentasEnEsperaAction(
  sucursalId: string,
  usuarioIdsExtra: string[] = [],
): Promise<ListarVentasEnEsperaResult> {
  try {
    if (!uuid.safeParse(sucursalId).success) return { error: "Sucursal inválida." };
    const ctx = await contexto();
    if (!ctx) return { error: "Sesión no válida." };
    if (!(await puedeUsarSucursal(ctx, sucursalId))) return { error: "Sin acceso a la sucursal." };

    const { data, error } = await ctx.supabase
      .from("mm_ventas_pendientes")
      .select(
        "id, tenant_id, sucursal_id, usuario_id, cliente_id, nota, carrito_json, pagos_json, descuento_pct, descuento_monto, tasa_tipo, subtotal_usd, articulos_count, estado, created_at, updated_at",
      )
      .eq("tenant_id", ctx.tenantId)
      .eq("sucursal_id", sucursalId)
      .eq("estado", "en_espera")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) return { error: error.message };

    const extras = usuarioIdsExtra.filter((id) => uuid.safeParse(id).success).slice(0, 100);
    const etiquetas = await resolverEtiquetasUsuarios(
      ctx.tenantId,
      [...(data ?? []).map((r) => r.usuario_id ?? ""), ...extras],
      sucursalId,
    );

    const ventas: VentaEnEsperaRemota[] = (data ?? []).map((r) => {
      const et = r.usuario_id ? etiquetas.get(r.usuario_id) : undefined;
      return {
        ...r,
        // jsonb llega como objeto; el formato local (SQLite) es texto JSON.
        carrito_json: JSON.stringify(r.carrito_json ?? []),
        pagos_json: JSON.stringify(r.pagos_json ?? []),
        subtotal_usd: Number(r.subtotal_usd ?? 0),
        articulos_count: Number(r.articulos_count ?? 0),
        usuario_nombre: et?.nombre ?? null,
        usuario_rol: et?.rol ?? null,
      };
    });

    return { ventas, etiquetas: Object.fromEntries(etiquetas) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo leer las ventas en espera." };
  }
}

export interface ReclamarVentaEnEsperaResult {
  ok?: boolean;
  /** La fila todavía no llegó al servidor (p. ej. se dejó en espera sin
   * señal en este mismo dispositivo) — se puede retomar solo desde local. */
  soloLocal?: boolean;
  error?: string;
}

/**
 * Marca la venta en espera como tomada por el usuario actual — solo si sigue
 * `en_espera` en ese instante (UPDATE condicional atómico). Si otro usuario
 * ya la retomó, devuelve error y el POS no la carga.
 */
export async function reclamarVentaEnEsperaAction(
  id: string,
): Promise<ReclamarVentaEnEsperaResult> {
  try {
    if (!uuid.safeParse(id).success) return { error: "Venta en espera inválida." };
    const ctx = await contexto();
    if (!ctx) return { error: "Sesión no válida." };
    const permisoError = await requirePermisoAccion(
      ctx.supabase,
      ctx.tenantId,
      ctx.session.user.id,
      "ventas",
      "crear",
    );
    if (permisoError) return { error: permisoError };

    const { data: fila } = await ctx.supabase
      .from("mm_ventas_pendientes")
      .select("id, sucursal_id, usuario_id, estado")
      .eq("tenant_id", ctx.tenantId)
      .eq("id", id)
      .maybeSingle();
    if (!fila) return { ok: true, soloLocal: true };
    if (!(await puedeUsarSucursal(ctx, fila.sucursal_id))) {
      return { error: "Sin acceso a la sucursal de esta venta." };
    }

    const { data: reclamada, error } = await ctx.supabase
      .from("mm_ventas_pendientes")
      .update({
        estado: "activo",
        usuario_id: ctx.session.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", ctx.tenantId)
      .eq("id", id)
      .eq("estado", "en_espera")
      .select("id")
      .maybeSingle();
    if (error) return { error: error.message };
    if (reclamada) return { ok: true };

    // No estaba 'en_espera': si ya es un borrador activo del MISMO usuario
    // (p. ej. su propio cambio aún no subió), se permite; si es de otro, no.
    if (fila.usuario_id === ctx.session.user.id) return { ok: true };
    const et = fila.usuario_id
      ? (await resolverEtiquetasUsuarios(ctx.tenantId, [fila.usuario_id], fila.sucursal_id)).get(
          fila.usuario_id,
        )
      : undefined;
    return {
      error: et
        ? `Esta venta ya la retomó ${et.nombre} (${et.rol}).`
        : "Esta venta ya la retomó otro usuario.",
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo retomar la venta." };
  }
}

const filaSubidaSchema = z.object({
  id: uuid,
  sucursal_id: uuid,
  cliente_id: uuid.nullable(),
  nota: z.string().max(200).nullable(),
  carrito_json: z.string().max(200_000),
  pagos_json: z.string().max(50_000),
  descuento_pct: z.string().max(20),
  descuento_monto: z.string().max(20),
  tasa_tipo: z.enum(["bcv", "euro", "manual"]),
  subtotal_usd: z.coerce.number().finite(),
  created_at: z.string().max(40),
  updated_at: z.string().max(40),
});

export interface SubirVentasEnEsperaResult {
  /** ids subidas (o ya presentes igual en el servidor). */
  subidas: string[];
  error?: string;
}

/**
 * Sube al servidor las ventas en espera que este dispositivo tiene solo en
 * local. Es el camino que hace que OTROS usuarios las vean: no depende de que
 * PowerSync esté conectado (sin `NEXT_PUBLIC_POWERSYNC_URL` la base local
 * nunca sube nada por sí sola).
 *
 * No pisa una venta que otro usuario ya retomó (fila `activo` de otro
 * usuario): esa se omite. `usuario_id` = quien la dejó en espera (el usuario
 * de esta sesión).
 */
export async function subirVentasEnEsperaAction(
  filas: unknown[],
): Promise<SubirVentasEnEsperaResult> {
  try {
    const ctx = await contexto();
    if (!ctx) return { subidas: [], error: "Sesión no válida." };
    const permisoError = await requirePermisoAccion(
      ctx.supabase,
      ctx.tenantId,
      ctx.session.user.id,
      "ventas",
      "crear",
    );
    if (permisoError) return { subidas: [], error: permisoError };

    const validas = filas
      .slice(0, 50)
      .map((f) => filaSubidaSchema.safeParse(f))
      .flatMap((r) => (r.success ? [r.data] : []));
    if (validas.length === 0) return { subidas: [] };

    const permitidas = new Set(
      (await sucursalesPermitidas(ctx.supabase, ctx.tenantId, ctx.session.user.id)).map(
        (s) => s.id,
      ),
    );
    const { data: existentes } = await ctx.supabase
      .from("mm_ventas_pendientes")
      .select("id, usuario_id, estado")
      .eq("tenant_id", ctx.tenantId)
      .in(
        "id",
        validas.map((f) => f.id),
      );
    const existentePorId = new Map((existentes ?? []).map((e) => [e.id, e]));

    const subidas: string[] = [];
    for (const f of validas) {
      if (!permitidas.has(f.sucursal_id)) continue;
      const previa = existentePorId.get(f.id);
      if (previa && previa.estado !== "en_espera" && previa.usuario_id !== ctx.session.user.id) {
        continue; // otro usuario la retomó: no se pisa.
      }
      let carrito: unknown = [];
      let pagos: unknown = [];
      try {
        carrito = JSON.parse(f.carrito_json);
        pagos = JSON.parse(f.pagos_json);
      } catch {
        continue;
      }
      if (!Array.isArray(carrito) || !Array.isArray(pagos) || carrito.length === 0) continue;
      const articulos = carrito.reduce(
        (s: number, i) => s + (Number((i as { cantidad?: unknown }).cantidad) || 0),
        0,
      );
      const { error } = await ctx.supabase.from("mm_ventas_pendientes").upsert({
        id: f.id,
        tenant_id: ctx.tenantId,
        sucursal_id: f.sucursal_id,
        usuario_id: ctx.session.user.id,
        cliente_id: f.cliente_id,
        nota: f.nota,
        carrito_json: carrito as never,
        pagos_json: pagos as never,
        descuento_pct: f.descuento_pct,
        descuento_monto: f.descuento_monto,
        tasa_tipo: f.tasa_tipo,
        subtotal_usd: Math.round(f.subtotal_usd * 100) / 100,
        articulos_count: articulos,
        estado: "en_espera",
        created_at: f.created_at,
        updated_at: f.updated_at,
      });
      if (error) {
        console.error("[subirVentasEnEspera] no se pudo subir", f.id, error.message);
        continue;
      }
      subidas.push(f.id);
    }
    return { subidas };
  } catch (err) {
    return {
      subidas: [],
      error: err instanceof Error ? err.message : "No se pudo subir las ventas en espera.",
    };
  }
}

/** Cancela (borra) una venta en espera en el servidor — para las que no están en local. */
export async function cancelarVentaEnEsperaAction(id: string): Promise<{ error?: string }> {
  try {
    if (!uuid.safeParse(id).success) return { error: "Venta en espera inválida." };
    const ctx = await contexto();
    if (!ctx) return { error: "Sesión no válida." };
    const permisoError = await requirePermisoAccion(
      ctx.supabase,
      ctx.tenantId,
      ctx.session.user.id,
      "ventas",
      "crear",
    );
    if (permisoError) return { error: permisoError };

    const { data: fila } = await ctx.supabase
      .from("mm_ventas_pendientes")
      .select("sucursal_id")
      .eq("tenant_id", ctx.tenantId)
      .eq("id", id)
      .maybeSingle();
    if (!fila) return {};
    if (!(await puedeUsarSucursal(ctx, fila.sucursal_id))) {
      return { error: "Sin acceso a la sucursal de esta venta." };
    }
    const { error } = await ctx.supabase
      .from("mm_ventas_pendientes")
      .delete()
      .eq("tenant_id", ctx.tenantId)
      .eq("id", id)
      .eq("estado", "en_espera");
    return error ? { error: error.message } : {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo cancelar." };
  }
}
