-- =============================================================================
-- 0107 - IGTF congelado por linea de venta (impuestos por producto)
-- (comentarios en ASCII plano, ver 0032/0036: tildes rompen el parser al
-- copiar y pegar en el SQL Editor de Supabase).
--
-- Hasta ahora `mm_productos.aplica_igtf` (por producto) se guarda pero NUNCA
-- se usa en el calculo: el IGTF se cobraba sobre el 100% de cualquier pago en
-- divisa, sin mirar que productos hay en el carrito. Esta columna congela, al
-- momento de la venta, si ESA linea causaba IGTF (copia de
-- mm_productos.aplica_igtf en ese momento, con el override puntual del cajero
-- si lo hubo desde el POS) -- mismo patron que `impuesto_id` (ya existente en
-- esta tabla) y que `precio_ajustado`/`motivo_ajuste_precio` (migracion 0088):
-- nunca cambia mm_productos, solo registra lo que realmente se cobro en esa
-- venta puntual.
--
-- Default `true` para las filas existentes preserva el comportamiento
-- historico exacto (todas las ventas ya registradas asumian IGTF sobre el
-- 100% del carrito) -- no altera ningun reporte pasado.
-- =============================================================================

alter table public.mm_ventas_items
  add column if not exists aplica_igtf boolean not null default true;

comment on column public.mm_ventas_items.aplica_igtf is
  'Si esta linea causaba IGTF al pagarse en divisa, congelado al momento de '
  'la venta (copia de mm_productos.aplica_igtf en ese momento, con el '
  'override puntual del cajero si lo hubo). No cambia mm_productos.';

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0107_mm_ventas_items_igtf.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
