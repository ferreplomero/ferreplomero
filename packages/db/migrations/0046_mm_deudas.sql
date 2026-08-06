-- =============================================================================
-- 0046 - Modulo Deudas: pasivos del DUENO/NEGOCIO (prestamos, servicios,
-- alquiler, etc.) -- comentarios en ASCII plano, ver 0032/0036/0042.
--
-- DISTINTO de "cuentas por pagar a proveedores" (mm_compras con
-- estado='borrador', ver compras/por-pagar): eso es mercancia recibida
-- pendiente de pagarle al proveedor, sin plazos ni abonos parciales. Este
-- modulo es para las deudas GENERALES del dueno (prestamos personales,
-- servicios, alquiler del local, deudas familiares, impuestos, etc.), con
-- monto, vencimiento opcional y abonos parciales -- un pasivo del negocio
-- para control interno (se puede enlazar a Finanzas), no una recepcion de
-- inventario.
--
-- Mismo patron de "ledger append-only" que mm_fiados/mm_abonos_fiado: el
-- saldo de una deuda NUNCA es una columna editable, siempre se deriva de
-- monto_usd - SUM(abonos) en la vista mm_v_saldo_deuda.
--
-- fecha y vencimiento son `date` (no timestamptz): son fechas de calendario
-- puras sin componente de hora, asi que no hay conversion de zona horaria
-- que corregir jamas (a diferencia del bug de mm_compras.fecha corregido en
-- 0045). El instante real de registro, si hiciera falta, ya esta en
-- created_at (timestamptz, default now()).
-- =============================================================================

-- Estado de una deuda del dueno/negocio. "vencida" NO es un estado guardado:
-- se calcula en la app comparando vencimiento con la fecha actual (igual
-- que "moroso" en clientes) porque cambia solo con el paso del tiempo.
do $$ begin
  create type public.mm_deuda_estado as enum ('pendiente', 'pagada');
exception when duplicate_object then null; end $$;

-- --- Categorias de deuda (personalizables por negocio) --------------------------
create table if not exists public.mm_categorias_deuda (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  nombre      text not null check (char_length(nombre) between 1 and 80),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create unique index if not exists mm_categorias_deuda_tenant_nombre_key
  on public.mm_categorias_deuda (tenant_id, lower(nombre)) where deleted_at is null;
create index if not exists mm_categorias_deuda_tenant_idx on public.mm_categorias_deuda (tenant_id);

drop trigger if exists set_mm_categorias_deuda_updated_at on public.mm_categorias_deuda;
create trigger set_mm_categorias_deuda_updated_at before update on public.mm_categorias_deuda
  for each row execute function public.set_updated_at();

-- --- Deudas del dueno/negocio -----------------------------------------------------
create table if not exists public.mm_deudas (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  categoria_id  uuid references public.mm_categorias_deuda (id) on delete set null,
  descripcion   text not null check (char_length(descripcion) between 1 and 160),
  acreedor      text not null check (char_length(acreedor) between 1 and 160),
  monto_usd     numeric(14, 2) not null check (monto_usd > 0),
  fecha         date not null,
  vencimiento   date,
  estado        public.mm_deuda_estado not null default 'pendiente',
  notas         text,
  usuario_id    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists mm_deudas_tenant_idx on public.mm_deudas (tenant_id);
create index if not exists mm_deudas_categoria_idx on public.mm_deudas (categoria_id);

drop trigger if exists set_mm_deudas_updated_at on public.mm_deudas;
create trigger set_mm_deudas_updated_at before update on public.mm_deudas
  for each row execute function public.set_updated_at();

-- --- Abonos a deudas (ledger append-only, mismo patron que mm_abonos_fiado) ------
create table if not exists public.mm_abonos_deuda (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  deuda_id    uuid not null references public.mm_deudas (id) on delete cascade,
  monto_usd   numeric(14, 2) not null check (monto_usd > 0),
  monto_bs    numeric(16, 2),
  tasa_usada  numeric(18, 6),
  metodo      public.mm_metodo_pago not null default 'efectivo_usd',
  notas       text,
  usuario_id  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists mm_abonos_deuda_deuda_idx on public.mm_abonos_deuda (deuda_id);
create index if not exists mm_abonos_deuda_tenant_idx on public.mm_abonos_deuda (tenant_id);

-- Saldo por deuda: nunca un contador editable, siempre derivado del ledger
-- (mismo criterio que mm_v_saldo_cliente).
create or replace view public.mm_v_saldo_deuda
  with (security_invoker = true) as
select
  d.id as deuda_id,
  d.tenant_id,
  coalesce(a.total_pagado, 0) as pagado_usd,
  d.monto_usd - coalesce(a.total_pagado, 0) as saldo_usd
from public.mm_deudas d
left join (
  select deuda_id, sum(monto_usd) as total_pagado
  from public.mm_abonos_deuda
  group by deuda_id
) a on a.deuda_id = d.id
where d.deleted_at is null;

-- --- RLS: mismos 3 patrones que 0007_minimarket_rls.sql --------------------------

-- Tablas operativas mutables (select/insert/update; borrado logico via deleted_at).
do $$
declare
  t text;
  tablas text[] := array['mm_categorias_deuda', 'mm_deudas'];
begin
  foreach t in array tablas loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "%1$s_select" on public.%1$s', t);
    execute format(
      'create policy "%1$s_select" on public.%1$s for select to authenticated
         using (tenant_id in (select public.auth_tenant_ids()))', t);

    execute format('drop policy if exists "%1$s_insert" on public.%1$s', t);
    execute format(
      'create policy "%1$s_insert" on public.%1$s for insert to authenticated
         with check (tenant_id in (select public.auth_tenant_ids()))', t);

    execute format('drop policy if exists "%1$s_update" on public.%1$s', t);
    execute format(
      'create policy "%1$s_update" on public.%1$s for update to authenticated
         using (tenant_id in (select public.auth_tenant_ids()))
         with check (tenant_id in (select public.auth_tenant_ids()))', t);
  end loop;
end $$;

-- Ledger append-only (solo select + insert, inmutable).
do $$
declare
  t text;
  ledgers text[] := array['mm_abonos_deuda'];
begin
  foreach t in array ledgers loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "%1$s_select" on public.%1$s', t);
    execute format(
      'create policy "%1$s_select" on public.%1$s for select to authenticated
         using (tenant_id in (select public.auth_tenant_ids()))', t);

    execute format('drop policy if exists "%1$s_insert" on public.%1$s', t);
    execute format(
      'create policy "%1$s_insert" on public.%1$s for insert to authenticated
         with check (tenant_id in (select public.auth_tenant_ids()))', t);
  end loop;
end $$;

-- --- Permisos: nuevo modulo 'deudas' en mm_permisos_rol ---------------------------
alter table public.mm_permisos_rol drop constraint if exists mm_permisos_rol_modulo_check;
alter table public.mm_permisos_rol add constraint mm_permisos_rol_modulo_check
  check (modulo in (
    'ventas', 'inventario', 'compras', 'proveedores', 'clientes', 'fiado', 'caja',
    'tasa', 'reportes', 'finanzas', 'facturacion', 'configuracion', 'personal', 'deudas'
  ));

-- Dueno y administrador: acceso total. Las deudas del dueno son informacion
-- financiera sensible -- mismo criterio de restriccion que 'personal'.
insert into public.mm_permisos_rol (rol_id, modulo, ver, crear, editar, eliminar)
select r.id, 'deudas', true, true, true, true
from public.mm_roles r
where r.tenant_id is null and r.slug in ('dueno', 'administrador')
on conflict (rol_id, modulo) do update set
  ver = excluded.ver, crear = excluded.crear, editar = excluded.editar, eliminar = excluded.eliminar;

-- Supervisor/cajero/almacenista: sin acceso (igual que 'personal').
insert into public.mm_permisos_rol (rol_id, modulo, ver, crear, editar, eliminar)
select r.id, 'deudas', false, false, false, false
from public.mm_roles r
where r.tenant_id is null and r.slug in ('supervisor', 'cajero', 'almacenista')
on conflict (rol_id, modulo) do update set
  ver = excluded.ver, crear = excluded.crear, editar = excluded.editar, eliminar = excluded.eliminar;

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0046_mm_deudas.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
