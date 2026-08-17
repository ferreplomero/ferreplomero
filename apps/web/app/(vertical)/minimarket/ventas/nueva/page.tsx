import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LockKeyhole, Store } from "lucide-react";
import { Button, Card } from "@arkiteq/ui";
import { getCountryConfig } from "@arkiteq/core";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listProductos } from "@/lib/minimarket/data/inventario";
import { getSucursalActiva } from "@/lib/minimarket/sucursal-acceso";
import { SucursalSwitcher } from "@/components/minimarket/sucursal-switcher";
import { listClientes } from "@/lib/minimarket/data/clientes";
import { getTodasLasTasas, getTipoPreferido } from "@/lib/minimarket/exchange-rate";
import { getSesionAbierta } from "@/lib/minimarket/data/caja";
import { getProductosFrecuentes } from "@/lib/minimarket/data/ventas";
import { parseMetodosPago } from "@/lib/minimarket/metodos-pago";
import { listCuentasBancarias } from "@/lib/minimarket/data/bancos";
import { resolverContextoPermisos, requirePermisoAccion } from "@/lib/minimarket/permisos";
import { getPresupuestoDetalle } from "@/lib/minimarket/data/presupuestos";
import { getTimezoneNegocio } from "@/lib/minimarket/timezone";
import { PosCliente } from "@/components/minimarket/pos/pos-cliente-cargador";

export const metadata: Metadata = { title: "Nueva venta" };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NuevaVentaPage({ searchParams }: Props) {
  const session = await getSessionContext();
  const tenantId = session?.activeTenant?.id;
  if (!session || !tenantId) redirect("/login");

  const sp = await searchParams;
  const presupuestoIdParam = typeof sp.presupuestoId === "string" ? sp.presupuestoId : null;

  const supabase = await createClient();
  const country = getCountryConfig(session.activeTenant?.country);

  // La sucursal activa primero: `listProductos` la necesita para el
  // desglose por sucursal, y el catálogo del POS se remapea a sus números
  // (ver más abajo) — nunca al agregado del tenant.
  const { activa: sucursalActiva, permitidas: sucursales } = await getSucursalActiva(
    supabase,
    tenantId,
    session.user.id,
  );

  if (sucursales.length === 0 || !sucursalActiva) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <span className="bg-warning/12 text-warning inline-flex size-12 items-center justify-center rounded-2xl">
            <LockKeyhole className="size-6" aria-hidden />
          </span>
          <p className="text-heading font-medium">No tienes ninguna sucursal asignada</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Pídele al administrador que te asigne una sucursal desde Personal para poder vender.
          </p>
        </Card>
      </div>
    );
  }

  const [
    productosRaw,
    tasas,
    fuentePreferida,
    clientes,
    cajaSesion,
    frecuentesIds,
    configRes,
    cuentasBancarias,
    permisosCtx,
  ] = await Promise.all([
    listProductos(supabase, tenantId, sucursales),
    getTodasLasTasas(supabase, tenantId),
    getTipoPreferido(supabase, tenantId),
    listClientes(supabase, tenantId),
    getSesionAbierta(supabase, tenantId),
    getProductosFrecuentes(supabase, tenantId),
    supabase
      .from("mm_config_negocio")
      .select("parametros, metodos_pago, nombre_comercial")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    listCuentasBancarias(supabase, tenantId),
    resolverContextoPermisos(supabase, tenantId, session.user.id),
  ]);

  // Catálogo remapeado a la sucursal ACTIVA: solo productos con presencia
  // ahí, con SU stock (no el agregado del tenant) — así el filtro
  // "vendibles" de más abajo ya solo deja pasar lo disponible en esta
  // sucursal, sin tocar ese filtro ni `pos-cliente.tsx`.
  const productos = productosRaw.flatMap((p) => {
    const fila = p.stockPorSucursal.find((s) => s.sucursal_id === sucursalActiva.id);
    if (!fila?.disponible) return [];
    return [
      {
        ...p,
        stock_actual: fila.stock_actual,
        stock_minimo: fila.stock_minimo > 0 ? fila.stock_minimo : null,
        bajo_minimo: fila.stock_minimo > 0 && fila.stock_actual <= fila.stock_minimo,
      },
    ];
  });
  // Sin asignación operativa (ver `permisos.ts`) = sin restricción, igual
  // criterio que el resto del sistema de roles/permisos.
  const puedeAjustarPrecio = permisosCtx ? Boolean(permisosCtx.permisos.ventas?.editar) : true;
  const params = (configRes.data?.parametros as Record<string, unknown>) ?? {};
  const igtfActivo = params.igtf_activo !== false;
  const ivaActivo = Boolean(params.iva_activo ?? false);
  const ivaPct = Number(params.iva_pct ?? 16);
  const tasa = tasas[fuentePreferida];
  const metodosPago = parseMetodosPago(configRes.data?.metodos_pago);
  const nombreComercial = configRes.data?.nombre_comercial || "el negocio";

  // Presupuesto en conversión (?presupuestoId=) — precarga el carrito del POS
  // con sus productos/precios. Revalida permisos aquí de nuevo (defensa en
  // profundidad: esta página también es alcanzable directo por URL, no solo
  // desde el botón "Convertir en venta" que ya valida en
  // `prepararConversionPresupuesto`). Si algo no cuadra, simplemente se
  // ignora el parámetro y el POS arranca vacío como una venta normal.
  let presupuestoInicial: {
    id: string;
    clienteId: string | null;
    notas: string | null;
    tasaTipo: "bcv" | "euro" | "manual";
    items: { productoId: string; cantidad: number; precioAjustadoUsd?: number }[];
  } | null = null;
  let avisosStockPresupuesto: { nombre: string; cantidadPedida: number; stockActual: number }[] =
    [];

  if (presupuestoIdParam) {
    const permisoPresupuesto = await requirePermisoAccion(
      supabase,
      tenantId,
      session.user.id,
      "presupuestos",
      "crear",
    );
    if (!permisoPresupuesto) {
      const tzPresupuesto = await getTimezoneNegocio(supabase, tenantId);
      const presupuesto = await getPresupuestoDetalle(
        supabase,
        tenantId,
        presupuestoIdParam,
        tzPresupuesto,
      );
      if (presupuesto && presupuesto.estado === "pendiente") {
        const tieneAjustes = presupuesto.items.some((i) => i.precioAjustado);
        const permisoAjuste = tieneAjustes
          ? await requirePermisoAccion(supabase, tenantId, session.user.id, "ventas", "editar")
          : null;
        if (!tieneAjustes || !permisoAjuste) {
          presupuestoInicial = {
            id: presupuesto.id,
            clienteId: presupuesto.clienteId,
            notas: presupuesto.notas,
            tasaTipo: presupuesto.tasaTipo,
            items: presupuesto.items.map((i) => ({
              productoId: i.productoId,
              cantidad: i.cantidad,
              precioAjustadoUsd: i.precioAjustado ? i.precioUnitarioUsd : undefined,
            })),
          };
          avisosStockPresupuesto = presupuesto.items
            .map((i) => {
              const prod = productos.find((p) => p.id === i.productoId);
              return prod && prod.stock_actual < i.cantidad
                ? {
                    nombre: prod.nombre,
                    cantidadPedida: i.cantidad,
                    stockActual: prod.stock_actual,
                  }
                : null;
            })
            .filter((x): x is NonNullable<typeof x> => x !== null);
        }
      }
    }
  }

  // Bloquear el POS si no hay caja abierta
  if (!cajaSesion) {
    return (
      <div className="space-y-5">
        <header className="space-y-1">
          <h1 className="font-display text-heading text-2xl font-semibold">Nueva venta</h1>
        </header>
        <div className="flex flex-col items-center gap-5 rounded-xl border border-amber-200 bg-amber-50 px-6 py-12 text-center">
          <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
            <LockKeyhole className="size-7" aria-hidden />
          </span>
          <div className="space-y-1">
            <p className="text-heading text-lg font-semibold">Caja cerrada</p>
            <p className="text-muted-foreground max-w-sm text-sm">
              No hay ningún turno de caja abierto. Abre la caja primero para poder registrar ventas.
            </p>
          </div>
          <Button asChild>
            <Link href="/minimarket/caja">Ir a Caja</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Un producto sin stock no se puede vender — se oculta del catálogo del
  // POS (unidad y granel comparten el mismo campo `stock_actual`, así que un
  // granel con stock fraccionario como 0.5 sigue apareciendo con normalidad).
  const vendibles = productos.filter((p) => p.activo && p.stock_actual > 0);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-heading text-2xl font-semibold">Nueva venta</h1>
          <p className="text-muted-foreground">
            Toca los productos para armar el carrito. Puedes cobrar con varios métodos a la vez.
          </p>
        </div>
        <div className="border-border bg-surface-2 flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2">
          <Store className="text-accent-600 size-4 shrink-0" aria-hidden />
          {sucursales.length > 1 ? (
            <SucursalSwitcher activaId={sucursalActiva.id} permitidas={sucursales} />
          ) : (
            <span className="text-heading text-sm font-medium">{sucursalActiva.nombre}</span>
          )}
        </div>
      </header>

      {!tasa ? (
        <p className="bg-warning/10 text-warning rounded-lg px-4 py-3 text-sm font-medium">
          Debes definir la{" "}
          <Link href="/minimarket/tasa" className="underline">
            tasa del día
          </Link>{" "}
          antes de registrar ventas.
        </p>
      ) : null}

      <PosCliente
        productos={vendibles}
        frecuentesIds={frecuentesIds}
        tasa={tasa ? tasa.valor : null}
        tasas={{
          bcv: tasas.bcv?.valor ?? null,
          euro: tasas.euro?.valor ?? null,
          manual: tasas.manual?.valor ?? null,
        }}
        fuentePreferida={fuentePreferida}
        locale={country.locale}
        sucursalId={sucursalActiva.id}
        igtfActivo={igtfActivo}
        ivaActivo={ivaActivo}
        ivaPct={ivaPct}
        tenantId={tenantId}
        usuarioId={session.user.id}
        metodosPago={metodosPago}
        nombreComercial={nombreComercial}
        cuentasBancarias={cuentasBancarias.filter((c) => c.activa)}
        puedeAjustarPrecio={puedeAjustarPrecio}
        clientes={clientes.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          cedula: c.cedula,
          telefono: c.telefono,
          whatsapp: c.whatsapp,
          limite_fiado_usd: c.limite_fiado_usd,
          saldo_usd: c.saldo_usd,
          saldo_favor_usd: c.saldo_favor_usd,
        }))}
        presupuestoInicial={presupuestoInicial}
        avisosStockPresupuesto={avisosStockPresupuesto}
      />
    </div>
  );
}
