-- =============================================================================
-- 0109 - Migra mm_gastos_operativos.categoria (enum fijo, 0047) a una
-- categoria dinamica (mm_categorias_movimiento, 0108), para permitir
-- categorias propias ademas de las preestablecidas.
--
-- La columna enum `categoria` se deja en la tabla (deprecada, ya no se
-- escribe desde el codigo nuevo) -- no se elimina en esta migracion para no
-- arriesgar nada que todavia la este leyendo. Se puede limpiar en una
-- migracion futura una vez confirmado que nada la usa.
-- =============================================================================

alter table public.mm_gastos_operativos
  add column if not exists categoria_id uuid references public.mm_categorias_movimiento (id);

-- Siembra el set preestablecido de categorias de gasto para cada tenant que
-- ya tiene gastos registrados (los tenants sin gastos aun se siembran de
-- forma perezosa en la app, igual que mm_categorias_deuda).
insert into public.mm_categorias_movimiento (tenant_id, tipo, nombre, orden)
select distinct g.tenant_id, 'gasto'::public.mm_categoria_movimiento_tipo, v.nombre, v.orden
from public.mm_gastos_operativos g
cross join (values
  ('Servicios', 0),
  ('Alquiler', 1),
  ('Nómina/personal', 2),
  ('Mantenimiento', 3),
  ('Transporte/flete', 4),
  ('Herramientas/insumos', 5),
  ('Impuestos/tasas', 6),
  ('Publicidad', 7),
  ('Otros', 8)
) as v(nombre, orden)
on conflict (tenant_id, tipo, lower(nombre)) where deleted_at is null do nothing;

-- Backfill: mapea el valor viejo del enum al id de la categoria nueva
-- equivalente, por tenant.
update public.mm_gastos_operativos g
set categoria_id = c.id
from public.mm_categorias_movimiento c
where g.categoria_id is null
  and c.tenant_id = g.tenant_id
  and c.tipo = 'gasto'
  and c.deleted_at is null
  and lower(c.nombre) = lower(case g.categoria
        when 'alquiler' then 'Alquiler'
        when 'servicios' then 'Servicios'
        when 'sueldos' then 'Nómina/personal'
        when 'mantenimiento' then 'Mantenimiento'
        when 'impuestos_permisos' then 'Impuestos/tasas'
        else 'Otros'
      end);

alter table public.mm_gastos_operativos
  alter column categoria_id set not null;

create index if not exists mm_gastos_operativos_categoria_idx
  on public.mm_gastos_operativos (categoria_id);

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0109_mm_gastos_categoria_id.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
