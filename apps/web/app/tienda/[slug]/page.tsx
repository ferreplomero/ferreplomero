import type { Metadata } from "next";
import { createServiceClient } from "@arkiteq/db/service";
import { getTiendaPublica, resolverCatalogo } from "@/lib/minimarket/pedidos/publico";
import { CatalogoNoDisponible } from "@/components/minimarket/pedidos/catalogo-no-disponible";
import { TiendaCliente } from "./tienda-cliente";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Catálogo", robots: { index: false, follow: false } };

/** Tienda pública de una sucursal, sin sesión. Todo se lee en el servidor
 * con service_role a partir del slug activo (ver `lib/minimarket/pedidos/publico.ts`). */
export default async function TiendaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = createServiceClient();
  const catalogo = await resolverCatalogo(service, slug);
  if (!catalogo) return <CatalogoNoDisponible />;

  const tienda = await getTiendaPublica(service, catalogo);
  return (
    <TiendaCliente
      slug={catalogo.slug}
      negocio={tienda.negocio}
      sucursal={tienda.sucursal}
      tasa={tienda.tasa}
      productos={tienda.productos}
      categorias={tienda.categorias}
      metodos={tienda.metodos}
    />
  );
}
