import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles, UserCog } from "lucide-react";
import { Button, Card, CardContent } from "@arkiteq/ui";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listSucursales } from "@/lib/minimarket/data/inventario";
import { listCuentasBancarias } from "@/lib/minimarket/data/bancos";
import { TZ_DEFAULT } from "@/lib/minimarket/timezone";
import { parseMetodosPago } from "@/lib/minimarket/metodos-pago";
import { getTodasLasTasas, getTipoPreferido } from "@/lib/minimarket/exchange-rate";
import { TasasPanel } from "@/components/minimarket/tasa/tasas-panel";
import { NegocioForm } from "./negocio-form";
import { LogoUpload } from "./logo-upload";
import { ParametrosForm } from "./parametros-form";
import { MargenGlobalForm } from "./margen-global-form";
import { ReciboForm } from "./recibo-form";
import { SucursalesPanel } from "./sucursales-panel";
import { MetodosPagoForm } from "./metodos-pago-form";
import { CambiarPasswordForm } from "./cambiar-password-form";

export const metadata: Metadata = { title: "Configuración" };

export default async function ConfiguracionPage() {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const supabase = await createClient();

  const [configRes, sucursales, tasas, fuentePreferida, cuentasBancarias] = await Promise.all([
    supabase.from("mm_config_negocio").select("*").eq("tenant_id", tenantId).maybeSingle(),
    listSucursales(supabase, tenantId),
    getTodasLasTasas(supabase, tenantId),
    getTipoPreferido(supabase, tenantId),
    listCuentasBancarias(supabase, tenantId),
  ]);

  const config = configRes.data;
  const parametros =
    config?.parametros && typeof config.parametros === "object" && !Array.isArray(config.parametros)
      ? (config.parametros as Record<string, unknown>)
      : {};
  const currentTimezone =
    typeof parametros.timezone === "string" && parametros.timezone.length > 0
      ? parametros.timezone
      : TZ_DEFAULT;
  const currentTelefono = typeof parametros.telefono === "string" ? parametros.telefono : "";
  const metodosPago = parseMetodosPago(config?.metodos_pago);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <h1 className="font-display text-heading text-2xl font-semibold">Configuración</h1>
        <p className="text-muted-foreground">
          Datos del negocio, sucursales y parámetros fiscales.
        </p>
      </header>

      {/* Datos del negocio */}
      <section className="space-y-4">
        <h2 className="text-heading text-lg font-semibold">Datos del negocio</h2>
        <LogoUpload logoUrl={config?.logo_url ?? null} />
        <NegocioForm
          nombre={config?.nombre_comercial ?? ""}
          rif={config?.rif ?? ""}
          direccion={config?.direccion ?? ""}
          telefono={currentTelefono}
          timezone={currentTimezone}
        />
      </section>

      {/* Recibos de venta */}
      <section className="space-y-4">
        <h2 className="text-heading text-lg font-semibold">Recibos de venta</h2>
        <ReciboForm
          mostrarEncabezado={parametros.mostrar_encabezado_recibo !== false}
          mostrarLeyenda={parametros.mostrar_leyenda_no_fiscal !== false}
          mostrarBotonWhatsapp={parametros.mostrar_boton_whatsapp_recibo !== false}
        />
      </section>

      {/* Tasas de cambio */}
      <section className="space-y-4">
        <div>
          <h2 className="text-heading text-lg font-semibold">Tasas de cambio</h2>
          <p className="text-muted-foreground text-sm">
            Guarda el valor de cada tasa a mano o sincronizándola con el BCV, y aparte elige cuál de
            las 3 usa el POS con &quot;Hacer predeterminada&quot;. Es la misma tasa en
            Configuración, en Tasa de cambio y en el POS.
          </p>
        </div>
        <TasasPanel
          tasas={tasas}
          fuentePreferida={fuentePreferida}
          tenantId={tenantId}
          usuarioId={session.user.id}
        />
      </section>

      {/* Parámetros fiscales */}
      <section className="space-y-4">
        <h2 className="text-heading text-lg font-semibold">Parámetros fiscales</h2>
        <ParametrosForm
          igtfPct={Number(parametros.igtf_pct ?? 3)}
          ivaPct={Number(parametros.iva_pct ?? 16)}
          redondeoBs={Number(parametros.redondeo_bs ?? 0)}
          monedaBase={(parametros.moneda_base as "USD" | "VES") ?? "USD"}
          precioMinoristaIncluyeIgtf={Boolean(parametros.precio_minorista_incluye_igtf ?? false)}
          igtfActivo={parametros.igtf_activo !== false}
          ivaActivo={Boolean(parametros.iva_activo ?? false)}
        />
      </section>

      {/* Margen de ganancia global */}
      <section className="space-y-4">
        <h2 className="text-heading text-lg font-semibold">Margen de ganancia global</h2>
        <MargenGlobalForm
          margenGlobalActivo={Boolean(parametros.margen_global_activo ?? false)}
          margenGlobalPct={
            typeof parametros.margen_global_pct === "number" ? parametros.margen_global_pct : null
          }
        />
      </section>

      {/* Métodos de pago */}
      <section className="space-y-4">
        <h2 className="text-heading text-lg font-semibold">Métodos de pago</h2>
        <MetodosPagoForm metodos={metodosPago} cuentasBancarias={cuentasBancarias} />
      </section>

      {/* Sucursales */}
      <section className="space-y-4">
        <h2 className="text-heading text-lg font-semibold">Sucursales</h2>
        <SucursalesPanel sucursales={sucursales} />
      </section>

      {/* Personal y roles: se mudó a su propia sección del menú lateral */}
      <section className="space-y-4">
        <h2 className="text-heading text-lg font-semibold">Personal y roles</h2>
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
            <div className="flex items-center gap-3">
              <span className="bg-accent-500/10 text-accent-600 inline-flex size-10 shrink-0 items-center justify-center rounded-xl">
                <UserCog className="size-5" aria-hidden />
              </span>
              <div>
                <p className="text-heading text-sm font-medium">Registra y administra tu equipo</p>
                <p className="text-muted-foreground text-sm">
                  Da de alta personal con su propio acceso, asígnales un rol y crea roles
                  personalizados desde el menú &quot;Personal&quot;.
                </p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/minimarket/personal">Ir a Personal</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* Seguridad de la cuenta */}
      {session.user.email ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-heading text-lg font-semibold">Seguridad de tu cuenta</h2>
            <p className="text-muted-foreground text-sm">
              Cambia la contraseña con la que inicias sesión. Te pedimos la actual para confirmar
              que eres tú.
            </p>
          </div>
          <CambiarPasswordForm email={session.user.email} />
        </section>
      ) : null}

      {/* Ayuda */}
      <section className="space-y-4">
        <h2 className="text-heading text-lg font-semibold">Ayuda</h2>
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
            <div className="flex items-center gap-3">
              <span className="bg-accent-500/10 text-accent-600 inline-flex size-10 shrink-0 items-center justify-center rounded-xl">
                <Sparkles className="size-5" aria-hidden />
              </span>
              <div>
                <p className="text-heading text-sm font-medium">Recorrido guiado con Arki</p>
                <p className="text-muted-foreground text-sm">
                  Vuelve a ver la bienvenida por los módulos principales.
                </p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/minimarket?tour=1">Ver tutorial de nuevo</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
