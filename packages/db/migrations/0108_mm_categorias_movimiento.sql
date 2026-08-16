-- =============================================================================
-- 0108 - Categorias dinamicas para Gastos operativos y Otros ingresos.
--
-- Contexto: mm_gastos_operativos.categoria era un enum fijo de Postgres (6
-- valores curados, ver 0047) y mm_otros_ingresos no tenia columna de
-- categoria en absoluto (ver 0101). El dueno pidio poder organizar ambos
-- libros por categoria, con un set preestablecido por rubro (ferreteria/
-- plomeria) Y la opcion de crear categorias propias desde el formulario
-- (alta rapida), igual que ya existe para productos (mm_categorias) y para
-- deudas (mm_categorias_deuda).
--
-- Una sola tabla con `tipo` (en vez de dos tablas separadas) porque el
-- shape es identico (id/tenant/nombre/orden) y el `tipo` ya discrimina el
-- catalogo -- evita duplicar CRUD, RLS y el componente de alta rapida.
--
-- Sin seed en SQL: igual que mm_categorias_deuda (ver
-- lib/minimarket/data/deudas.ts::listCategoriasDeuda), el set por defecto se
-- siembra en la app la primera vez que el tenant no tiene categorias de un
-- `tipo` -- idempotente, y cubre tenants nuevos sin migracion de datos.
-- =============================================================================

do $$ begin
  create type public.mm_categoria_movimiento_tipo as enum ('gasto', 'otro_ingreso');
exception when duplicate_object then null; end $$;

create table if not exists public.mm_categorias_movimiento (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  tipo        public.mm_categoria_movimiento_tipo not null,
  nombre      text not null check (char_length(nombre) between 1 and 60),
  orden       int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists mm_categorias_movimiento_tenant_idx
  on public.mm_categorias_movimiento (tenant_id, tipo);

-- Evita duplicados por tenant+tipo (case-insensitive), solo entre filas vivas.
create unique index if not exists mm_categorias_movimiento_nombre_unq
  on public.mm_categorias_movimiento (tenant_id, tipo, lower(nombre))
  where deleted_at is null;

drop trigger if exists set_mm_categorias_movimiento_updated_at on public.mm_categorias_movimiento;
create trigger set_mm_categorias_movimiento_updated_at before update on public.mm_categorias_movimiento
  for each row execute function public.set_updated_at();

-- RLS: catalogo mutable por el tenant, mismo patron que mm_categorias_deuda
-- (0046) -- select/insert/update por pertenencia al tenant; borrado logico
-- via deleted_at, sin politica delete.
alter table public.mm_categorias_movimiento enable row level security;

drop policy if exists "mm_categorias_movimiento_select" on public.mm_categorias_movimiento;
create policy "mm_categorias_movimiento_select" on public.mm_categorias_movimiento for select to authenticated
  using (tenant_id in (select public.auth_tenant_ids()));

drop policy if exists "mm_categorias_movimiento_insert" on public.mm_categorias_movimiento;
create policy "mm_categorias_movimiento_insert" on public.mm_categorias_movimiento for insert to authenticated
  with check (tenant_id in (select public.auth_tenant_ids()));

drop policy if exists "mm_categorias_movimiento_update" on public.mm_categorias_movimiento;
create policy "mm_categorias_movimiento_update" on public.mm_categorias_movimiento for update to authenticated
  using (tenant_id in (select public.auth_tenant_ids()))
  with check (tenant_id in (select public.auth_tenant_ids()));

-- Sin modulo de permisos nuevo: vive dentro de /minimarket/reportes (gastos,
-- otros-ingresos, categorias), ya cubierto por el modulo 'reportes' existente
-- en mm_permisos_rol -- mismo criterio que mm_gastos_operativos (0047).

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0108_mm_categorias_movimiento.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
