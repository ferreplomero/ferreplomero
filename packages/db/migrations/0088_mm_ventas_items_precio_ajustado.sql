-- =============================================================================
-- 0088 - Precio ajustado por linea de venta (precio puntual para esa venta,
-- sin tocar el precio del producto en el inventario).
--
-- mm_ventas_items.precio_usd/total_usd YA se congelan al momento de vender
-- (no son un JOIN en vivo contra mm_productos) -- Ganancias, Reportes y el
-- Recibo ya leen esa columna congelada, asi que no necesitan ningun cambio:
-- en cuanto una linea guarde un precio distinto al del catalogo, esos 3 ya
-- reflejan el precio real automaticamente.
--
-- Estas dos columnas nuevas son solo para poder mostrar el aviso "Ajustado"
-- de forma confiable en el recibo/historial SIN depender de comparar contra
-- el precio actual del catalogo (que puede cambiar despues de la venta y dar
-- falsos positivos/negativos con el tiempo).
-- =============================================================================

alter table public.mm_ventas_items
  add column if not exists precio_ajustado boolean not null default false,
  add column if not exists motivo_ajuste_precio text;

comment on column public.mm_ventas_items.precio_ajustado is
  'true si el cajero cambio el precio de esta linea solo para esta venta '
  '(no afecta mm_productos.precio_usd). false = precio normal del catalogo.';

comment on column public.mm_ventas_items.motivo_ajuste_precio is
  'Motivo opcional que escribio el cajero al ajustar el precio (ej. '
  '"producto danado", "precio negociado"). NULL si no aplica o no se escribio.';

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0088_mm_ventas_items_precio_ajustado.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
