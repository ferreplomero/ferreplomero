-- =============================================================================
-- 0110 - Agrega categoria a mm_otros_ingresos (mm_categorias_movimiento, 0108).
--
-- A diferencia de 0101 (donde se decidio no tener categoria porque el
-- concepto es heterogeneo y la descripcion libre alcanzaba), el dueno pidio
-- poder organizar tambien Otros Ingresos por categoria para el Libro Diario/
-- Mayor. Set preestablecido: Aporte del dueno, Venta de activo, Prestamo
-- recibido, Reembolso, Intereses, Otros -- mas la opcion de crear propias.
-- =============================================================================

alter table public.mm_otros_ingresos
  add column if not exists categoria_id uuid references public.mm_categorias_movimiento (id);

-- Siembra el set preestablecido para cada tenant que ya tiene otros-ingresos
-- registrados (los tenants sin ninguno aun se siembran de forma perezosa en
-- la app, igual que mm_categorias_deuda / mm_categorias_movimiento de gasto).
insert into public.mm_categorias_movimiento (tenant_id, tipo, nombre, orden)
select distinct o.tenant_id, 'otro_ingreso'::public.mm_categoria_movimiento_tipo, v.nombre, v.orden
from public.mm_otros_ingresos o
cross join (values
  ('Aporte del dueño', 0),
  ('Venta de activo', 1),
  ('Préstamo recibido', 2),
  ('Reembolso', 3),
  ('Intereses', 4),
  ('Otros', 5)
) as v(nombre, orden)
on conflict (tenant_id, tipo, lower(nombre)) where deleted_at is null do nothing;

-- Backfill: sin equivalente historico (la tabla nunca tuvo categoria), todo
-- lo existente se clasifica como "Otros" -- el dueno puede reclasificarlo
-- despues editando cada registro.
update public.mm_otros_ingresos o
set categoria_id = c.id
from public.mm_categorias_movimiento c
where o.categoria_id is null
  and c.tenant_id = o.tenant_id
  and c.tipo = 'otro_ingreso'
  and c.deleted_at is null
  and lower(c.nombre) = lower('Otros');

alter table public.mm_otros_ingresos
  alter column categoria_id set not null;

create index if not exists mm_otros_ingresos_categoria_idx
  on public.mm_otros_ingresos (categoria_id);

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0110_mm_otros_ingresos_categoria_id.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
