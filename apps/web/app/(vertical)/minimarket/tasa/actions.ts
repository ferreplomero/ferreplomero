"use server";

// Registra las fuentes BCV y Euro BCV como efecto secundario.
import "@/lib/minimarket/rate-sources";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  setTasaManual,
  refreshTasaAuto,
  TIPOS_TASA,
  type TipoTasa,
} from "@/lib/minimarket/exchange-rate";
import { requirePermisoAccion } from "@/lib/minimarket/permisos";

export interface TasaResult {
  ok?: boolean;
  error?: string;
  valor?: number;
}

function revalidarTasas() {
  revalidatePath("/minimarket/tasa");
  revalidatePath("/minimarket/configuracion");
  revalidatePath("/minimarket");
  revalidatePath("/minimarket/inventario");
  revalidatePath("/minimarket/ventas/nueva");
}

/**
 * Define un valor escrito A MANO para cualquiera de las 3 tasas (BCV, Euro
 * BCV o Personalizada). SOLO guarda el valor — "Guardar" y "Hacer
 * predeterminada" (`definirFuentePreferida`) son acciones independientes: el
 * negocio puede registrar un valor sin que esa tasa pase a ser la que usa el
 * POS por defecto.
 */
export async function definirTasa(_prev: TasaResult, formData: FormData): Promise<TasaResult> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { error: "Sesión no válida." };

  const supabase = await createClient();
  const permisoError = await requirePermisoAccion(
    supabase,
    tenantId,
    session.user.id,
    "tasa",
    "editar",
  );
  if (permisoError) return { error: permisoError };

  const tipo = formData.get("tipo");
  if (typeof tipo !== "string" || !TIPOS_TASA.includes(tipo as TipoTasa)) {
    return { error: "Tipo de tasa inválido." };
  }

  const valor = Number(String(formData.get("valor") ?? "").replace(",", "."));
  if (!Number.isFinite(valor) || valor <= 0) {
    return { error: "Ingresa una tasa válida (mayor que cero)." };
  }

  try {
    await setTasaManual(supabase, {
      tenantId,
      tipo: tipo as TipoTasa,
      valor,
      usuarioId: session.user.id,
    });
  } catch {
    return { error: "No se pudo guardar la tasa." };
  }

  revalidarTasas();
  return { ok: true };
}

/**
 * Consulta la fuente automática (BCV o Euro BCV) indicada y guarda su tasa.
 * SOLO actualiza el valor — no cambia cuál tasa está preseleccionada (ver
 * `definirFuentePreferida`). Requiere internet por naturaleza (consulta una
 * API externa); si falla, el negocio sigue pudiendo escribir la tasa a mano
 * sin ningún bloqueo.
 */
export async function actualizarTasaAuto(
  _prev: TasaResult,
  formData: FormData,
): Promise<TasaResult> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { error: "Sesión no válida." };

  const supabase = await createClient();
  const permisoError = await requirePermisoAccion(
    supabase,
    tenantId,
    session.user.id,
    "tasa",
    "editar",
  );
  if (permisoError) return { error: permisoError };

  const tipo = formData.get("tipo");
  if (tipo !== "bcv" && tipo !== "euro") {
    return { error: "Tipo de tasa inválido." };
  }

  try {
    const valor = await refreshTasaAuto(supabase, tenantId, tipo);
    if (!valor) return { error: `La fuente "${tipo}" no está registrada.` };
    revalidarTasas();
    return { ok: true, valor };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al consultar la fuente.";
    return { error: msg };
  }
}

/** Cambia cuál de las 3 tasas es la preseleccionada (afecta todo el sistema por defecto). */
export async function definirFuentePreferida(
  _prev: TasaResult,
  formData: FormData,
): Promise<TasaResult> {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) return { error: "Sesión no válida." };

  const supabase = await createClient();
  const permisoError = await requirePermisoAccion(
    supabase,
    tenantId,
    session.user.id,
    "tasa",
    "editar",
  );
  if (permisoError) return { error: permisoError };

  const fuente = formData.get("fuente_tasa");
  if (typeof fuente !== "string" || !TIPOS_TASA.includes(fuente as TipoTasa)) {
    return { error: "Selecciona una tasa válida." };
  }

  const { error } = await supabase
    .from("mm_config_negocio")
    .upsert(
      { tenant_id: tenantId, fuente_tasa: fuente },
      { onConflict: "tenant_id", ignoreDuplicates: false },
    );
  if (error) return { error: "No se pudo guardar la tasa preseleccionada." };

  revalidarTasas();
  return { ok: true };
}
