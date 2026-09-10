-- =============================================================================
-- 0117 - Diferencial de tasa de cambio por producto (comprador vs. proveedor)
-- (comentarios en ASCII plano, ver 0032/0036: tildes rompen el parser al
-- copiar y pegar en el SQL Editor de Supabase).
--
-- Algunos proveedores compran/facturan con una tasa de cambio distinta a la
-- BCV del negocio (BCV, euro BCV, o una tasa PERSONALIZADA del proveedor).
-- El diferencial = tasa_bcv / tasa_proveedor ajusta el precio de venta para
-- compensar esa diferencia:
--   precio_venta = (costo_usd / (1 - margen_venta_pct/100)) * diferencial
-- Nota: margen_venta_pct es el margen sobre el PRECIO DE VENTA (no sobre el
-- costo, a diferencia del margen normal/global del producto) -- convencion
-- distinta, usada SOLO cuando diferencial_activo = true.
--
-- Capa 100% OPCIONAL: diferencial_activo default false, no afecta el calculo
-- de ningun producto existente ni de uno nuevo que no la active. El precio
-- resultante se guarda igual que siempre en precio_usd (se calcula en el
-- cliente, mismo criterio que margen sobre costo / margen global).
-- =============================================================================

alter table public.mm_productos add column if not exists diferencial_activo boolean not null default false;
alter table public.mm_productos add column if not exists tipo_tasa_diferencial text;
alter table public.mm_productos add column if not exists tasa_proveedor_valor numeric;
alter table public.mm_productos add column if not exists margen_venta_pct numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mm_productos_tipo_tasa_diferencial_check'
  ) then
    alter table public.mm_productos
      add constraint mm_productos_tipo_tasa_diferencial_check
      check (tipo_tasa_diferencial is null or tipo_tasa_diferencial in ('bcv', 'euro', 'personalizada'));
  end if;
end $$;

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0117_mm_productos_diferencial_tasa.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
