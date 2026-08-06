-- =============================================================================
-- 0083 - Modulo Bancos: cuentas bancarias del NEGOCIO para el dinero digital
-- (pago movil, transferencia, tarjeta/punto). Es el equivalente digital de la
-- caja (efectivo): antes de esta migracion, un pago por esos 3 metodos se
-- guardaba en mm_pagos_venta y ahi moria el rastro -- no habia forma de saber
-- a que cuenta entro ni de ver su saldo (ver CLAUDE.md, plan aprobado).
--
-- Alcance deliberado: SOLO pago_movil, transferencia y tarjeta tienen cuentas
-- bancarias (CHECK abajo). Zelle y Cashea quedan exactamente como estan hoy
-- (datos planos en mm_config_negocio.metodos_pago) -- no se tocan.
--
-- mm_config_negocio.metodos_pago (jsonb) NO cambia de forma: el flag `activo`
-- de cada metodo sigue siendo la unica fuente de verdad de que boton de pago
-- se muestra en el POS. Los campos banco/telefono/titular/rif/cuenta que ese
-- jsonb ya tenia para pago_movil/transferencia/tarjeta dejan de usarse hacia
-- adelante (quedan como dato historico inerte, sin borrarse) -- se MIGRAN una
-- sola vez abajo a filas reales de mm_cuentas_bancarias para que ningun
-- negocio pierda lo que ya habia configurado.
-- =============================================================================

create table if not exists public.mm_cuentas_bancarias (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  metodo         public.mm_metodo_pago not null
                   check (metodo in ('pago_movil', 'transferencia', 'tarjeta')),
  banco          text not null check (char_length(banco) between 1 and 120),
  titular        text not null check (char_length(titular) between 1 and 160),
  rif            text,
  telefono       text,
  cuenta         text,
  predeterminada boolean not null default false,
  activa         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index if not exists mm_cuentas_bancarias_tenant_idx
  on public.mm_cuentas_bancarias (tenant_id);
create index if not exists mm_cuentas_bancarias_tenant_metodo_idx
  on public.mm_cuentas_bancarias (tenant_id, metodo) where deleted_at is null;

-- Solo una cuenta predeterminada por metodo y tenant -- lo garantiza la base
-- de datos, no el codigo de la app.
create unique index if not exists mm_cuentas_bancarias_predeterminada_unica
  on public.mm_cuentas_bancarias (tenant_id, metodo)
  where predeterminada and deleted_at is null;

drop trigger if exists set_mm_cuentas_bancarias_updated_at on public.mm_cuentas_bancarias;
create trigger set_mm_cuentas_bancarias_updated_at before update on public.mm_cuentas_bancarias
  for each row execute function public.set_updated_at();

-- --- Migracion de datos: una fila por negocio/metodo que ya tenia banco cargado ---
insert into public.mm_cuentas_bancarias
  (tenant_id, metodo, banco, titular, rif, telefono, cuenta, predeterminada, activa)
select
  c.tenant_id,
  (m ->> 'metodo')::public.mm_metodo_pago,
  trim(m ->> 'banco'),
  coalesce(nullif(trim(m ->> 'titular'), ''), 'Titular sin especificar'),
  nullif(trim(m ->> 'rif'), ''),
  nullif(trim(m ->> 'telefono'), ''),
  nullif(trim(m ->> 'cuenta'), ''),
  true,
  true
from public.mm_config_negocio c
cross join lateral jsonb_array_elements(c.metodos_pago) as m
where (m ->> 'metodo') in ('pago_movil', 'transferencia', 'tarjeta')
  and coalesce(trim(m ->> 'banco'), '') <> '';

-- --- RLS: mismo patron "operativa mutable" que mm_clientes (0007) ---------------
alter table public.mm_cuentas_bancarias enable row level security;

drop policy if exists "mm_cuentas_bancarias_select" on public.mm_cuentas_bancarias;
create policy "mm_cuentas_bancarias_select" on public.mm_cuentas_bancarias for select to authenticated
  using (tenant_id in (select public.auth_tenant_ids()));

drop policy if exists "mm_cuentas_bancarias_insert" on public.mm_cuentas_bancarias;
create policy "mm_cuentas_bancarias_insert" on public.mm_cuentas_bancarias for insert to authenticated
  with check (tenant_id in (select public.auth_tenant_ids()));

drop policy if exists "mm_cuentas_bancarias_update" on public.mm_cuentas_bancarias;
create policy "mm_cuentas_bancarias_update" on public.mm_cuentas_bancarias for update to authenticated
  using (tenant_id in (select public.auth_tenant_ids()))
  with check (tenant_id in (select public.auth_tenant_ids()));

-- --- Permisos: nuevo modulo 'bancos' en mm_permisos_rol -------------------------
-- Dinero digital tratado como informacion sensible -- mismo criterio de
-- restriccion que 'deudas' y 'personal' (ver 0046): solo dueno/administrador.
alter table public.mm_permisos_rol drop constraint if exists mm_permisos_rol_modulo_check;
alter table public.mm_permisos_rol add constraint mm_permisos_rol_modulo_check
  check (modulo in (
    'ventas', 'inventario', 'compras', 'proveedores', 'clientes', 'fiado', 'caja',
    'tasa', 'reportes', 'finanzas', 'facturacion', 'configuracion', 'personal', 'deudas',
    'bancos'
  ));

insert into public.mm_permisos_rol (rol_id, modulo, ver, crear, editar, eliminar)
select r.id, 'bancos', true, true, true, true
from public.mm_roles r
where r.tenant_id is null and r.slug in ('dueno', 'administrador')
on conflict (rol_id, modulo) do update set
  ver = excluded.ver, crear = excluded.crear, editar = excluded.editar, eliminar = excluded.eliminar;

insert into public.mm_permisos_rol (rol_id, modulo, ver, crear, editar, eliminar)
select r.id, 'bancos', false, false, false, false
from public.mm_roles r
where r.tenant_id is null and r.slug in ('supervisor', 'cajero', 'almacenista')
on conflict (rol_id, modulo) do update set
  ver = excluded.ver, crear = excluded.crear, editar = excluded.editar, eliminar = excluded.eliminar;

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0083_mm_cuentas_bancarias.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
