import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { getDisplayName } from "@/lib/auth/display-name";
import { createClient } from "@/lib/supabase/server";
import { OnboardingNegocioWizard } from "./onboarding-negocio-wizard";

export const metadata: Metadata = { title: "Bienvenida" };

export default async function BienvenidaPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/inicio");

  const supabase = await createClient();
  const { data: config } = await supabase
    .from("mm_config_negocio")
    .select("nombre_comercial, rif, direccion, logo_url, parametros, tipo_negocio")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const parametros =
    config?.parametros && typeof config.parametros === "object" && !Array.isArray(config.parametros)
      ? (config.parametros as Record<string, unknown>)
      : {};
  const telefono = typeof parametros.telefono === "string" ? parametros.telefono : "";

  // Rubros previamente elegidos (negocio mixto). Fuente principal:
  // `parametros.tipos_negocio` (arreglo). Respaldo: el `tipo_negocio` único de
  // la columna (negocios que se guardaron antes de soportar múltiples rubros).
  const tiposGuardados = Array.isArray(parametros.tipos_negocio)
    ? parametros.tipos_negocio.filter((v): v is string => typeof v === "string")
    : [];
  const tiposNegocio =
    tiposGuardados.length > 0 ? tiposGuardados : config?.tipo_negocio ? [config.tipo_negocio] : [];

  return (
    <div className="mx-auto max-w-3xl">
      <OnboardingNegocioWizard
        nombreComercial={
          config?.nombre_comercial === "Mi negocio" ? "" : (config?.nombre_comercial ?? "")
        }
        rif={config?.rif ?? ""}
        direccion={config?.direccion ?? ""}
        telefono={telefono}
        logoUrl={config?.logo_url ?? null}
        tiposNegocio={tiposNegocio}
        nombreUsuario={getDisplayName(session.user)}
      />
    </div>
  );
}
