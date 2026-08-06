/**
 * Endpoint de cron: refresca la tasa BCV y Euro BCV de cada negocio con el
 * producto minimarket activo, Y TAMBIÉN la tasa BCV/Euro de PLATAFORMA (la
 * que usa el admin para calcular el equivalente en Bs de los planes) —
 * mismo disparador para las dos, no hay un cron aparte por vertical. No lo
 * llama ningún usuario — lo dispara un workflow programado de GitHub Actions
 * cada 12 horas (ver .github/workflows/actualizar-tasas.yml), protegido con
 * un secreto.
 *
 * Usa `service_role` (salta RLS) porque no hay sesión de usuario en un cron.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@arkiteq/db/service";
import { refreshTasaAuto } from "@/lib/minimarket/exchange-rate";
import { refreshTasaAutoPlataforma } from "@/lib/platform/tasa";
// Registra las fuentes 'bcv' y 'euro' como efecto secundario.
import "@/lib/minimarket/rate-sources";

export const dynamic = "force-dynamic";

interface Resultado {
  tenantId: string;
  tipo: "bcv" | "euro";
  ok: boolean;
  valor?: number;
  error?: string;
}

interface ResultadoPlataforma {
  tipo: "bcv" | "euro";
  ok: boolean;
  valor?: number;
  error?: string;
}

async function ejecutar(): Promise<{
  tenants: number;
  resultados: Resultado[];
  plataforma: ResultadoPlataforma[];
}> {
  const supabase = createServiceClient();

  const { data: filas, error } = await supabase
    .from("entitlements")
    .select("tenant_id, product:products(slug)")
    .eq("status", "activo");

  if (error) throw new Error(`No se pudieron leer los entitlements: ${error.message}`);

  const tenantIds = Array.from(
    new Set((filas ?? []).filter((f) => f.product?.slug === "minimarket").map((f) => f.tenant_id)),
  );

  const resultados: Resultado[] = [];
  for (const tenantId of tenantIds) {
    for (const tipo of ["bcv", "euro"] as const) {
      try {
        const valor = await refreshTasaAuto(supabase, tenantId, tipo);
        resultados.push({ tenantId, tipo, ok: valor !== null, valor: valor ?? undefined });
      } catch (err) {
        resultados.push({
          tenantId,
          tipo,
          ok: false,
          error: err instanceof Error ? err.message : "Error desconocido.",
        });
      }
    }
  }

  const plataforma: ResultadoPlataforma[] = [];
  for (const tipo of ["bcv", "euro"] as const) {
    try {
      const valor = await refreshTasaAutoPlataforma(supabase, tipo, null);
      plataforma.push({ tipo, ok: true, valor });
    } catch (err) {
      plataforma.push({
        tipo,
        ok: false,
        error: err instanceof Error ? err.message : "Error desconocido.",
      });
    }
  }

  return { tenants: tenantIds.length, resultados, plataforma };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secreto = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secreto || auth !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const resultado = await ejecutar();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error inesperado.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
