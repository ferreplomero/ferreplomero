-- =============================================================================
-- 0039 - Roles y permisos configurables para el personal del minimarket
-- (comentarios en ASCII plano, ver 0032/0036: tildes rompen el parser al
-- copiar y pegar en el SQL Editor de Supabase).
--
-- Reemplaza el enum fijo mm_rol_operativo (no puede soportar roles
-- personalizados por negocio) por un modelo relacional:
--   mm_roles        -> catalogo de roles. tenant_id null = predefinido/global
--                      (compartido, sembrado abajo); tenant_id no-null = rol
--                      personalizado de ESE negocio.
--   mm_permisos_rol -> permisos ver/crear/editar/eliminar por modulo, uno por
--                      rol y modulo.
--   mm_usuarios_sucursal.rol_id -> reemplaza a la columna rol (enum vieja).
--
-- Se siembran 5 roles predefinidos (dueno, administrador, supervisor, cajero,
-- almacenista) con sus permisos segun la matriz acordada, se migran los datos
-- existentes de mm_usuarios_sucursal.rol al nuevo rol_id, y se retira el
-- enum viejo. Ningun negocio existente pierde acceso: sus asignaciones
-- actuales se remapean 1:1 a los roles predefinidos equivalentes
-- ('almacen' -> 'almacenista').
-- =============================================================================

-- --- 1) Catalogo de roles ------------------------------------------------------
create table if not exists public.mm_roles (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references public.tenants (id) on delete cascade,
  slug        text not null,
  nombre      text not null,
  es_sistema  boolean not null default false,
  descripcion text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Un solo rol global por slug; un rol personalizado por slug dentro de cada tenant.
create unique index if not exists mm_roles_slug_global_key
  on public.mm_roles (slug) where tenant_id is null;
create unique index if not exists mm_roles_tenant_slug_key
  on public.mm_roles (tenant_id, slug) where tenant_id is not null;
create index if not exists mm_roles_tenant_idx on public.mm_roles (tenant_id);

drop trigger if exists set_mm_roles_updated_at on public.mm_roles;
create trigger set_mm_roles_updated_at before update on public.mm_roles
  for each row execute function public.set_updated_at();

-- --- 2) Permisos por rol y modulo ----------------------------------------------
create table if not exists public.mm_permisos_rol (
  id        uuid primary key default gen_random_uuid(),
  rol_id    uuid not null references public.mm_roles (id) on delete cascade,
  modulo    text not null check (modulo in (
              'ventas', 'inventario', 'compras', 'proveedores', 'clientes',
              'fiado', 'caja', 'tasa', 'reportes', 'finanzas', 'facturacion',
              'configuracion', 'personal'
            )),
  ver       boolean not null default false,
  crear     boolean not null default false,
  editar    boolean not null default false,
  eliminar  boolean not null default false,
  unique (rol_id, modulo)
);
create index if not exists mm_permisos_rol_rol_idx on public.mm_permisos_rol (rol_id);

-- --- 3) Sembrado de los 5 roles predefinidos ------------------------------------
insert into public.mm_roles (tenant_id, slug, nombre, es_sistema, descripcion) values
  (null, 'dueno', 'Dueno / Administrador principal',
    true, 'Acceso total e irrevocable. Es quien registro el negocio.'),
  (null, 'administrador', 'Administrador',
    true, 'Los mismos permisos que el dueno: control total del negocio.'),
  (null, 'supervisor', 'Supervisor',
    true, 'Acceso operativo amplio, sin gestion de personal ni configuracion critica.'),
  (null, 'cajero', 'Cajero/a',
    true, 'Enfocado en vender: punto de venta, su caja y clientes.'),
  (null, 'almacenista', 'Almacenista',
    true, 'Enfocado en inventario, compras y proveedores.')
on conflict (slug) where tenant_id is null do nothing;

-- Dueno y administrador: acceso total (ver/crear/editar/eliminar) a todo.
insert into public.mm_permisos_rol (rol_id, modulo, ver, crear, editar, eliminar)
select r.id, m.modulo, true, true, true, true
from public.mm_roles r
cross join (values
  ('ventas'), ('inventario'), ('compras'), ('proveedores'), ('clientes'),
  ('fiado'), ('caja'), ('tasa'), ('reportes'), ('finanzas'), ('facturacion'),
  ('configuracion'), ('personal')
) as m(modulo)
where r.tenant_id is null and r.slug in ('dueno', 'administrador')
on conflict (rol_id, modulo) do update set
  ver = excluded.ver, crear = excluded.crear, editar = excluded.editar, eliminar = excluded.eliminar;

-- Supervisor: ve y opera casi todo, nunca elimina, sin personal/configuracion.
insert into public.mm_permisos_rol (rol_id, modulo, ver, crear, editar, eliminar)
select r.id, m.modulo, m.ver, m.crear, m.editar, m.eliminar
from public.mm_roles r
cross join (values
  ('ventas', true, true, true, false),
  ('inventario', true, true, true, false),
  ('compras', true, true, true, false),
  ('proveedores', true, true, true, false),
  ('clientes', true, true, true, false),
  ('fiado', true, true, true, false),
  ('caja', true, true, true, false),
  ('tasa', true, true, true, false),
  ('reportes', true, false, false, false),
  ('finanzas', true, false, false, false),
  ('facturacion', false, false, false, false),
  ('configuracion', false, false, false, false),
  ('personal', false, false, false, false)
) as m(modulo, ver, crear, editar, eliminar)
where r.tenant_id is null and r.slug = 'supervisor'
on conflict (rol_id, modulo) do update set
  ver = excluded.ver, crear = excluded.crear, editar = excluded.editar, eliminar = excluded.eliminar;

-- Cajero: enfocado en vender; su caja; sin inventario/compras/reportes/finanzas.
insert into public.mm_permisos_rol (rol_id, modulo, ver, crear, editar, eliminar)
select r.id, m.modulo, m.ver, m.crear, m.editar, m.eliminar
from public.mm_roles r
cross join (values
  ('ventas', true, true, false, false),
  ('inventario', true, false, false, false),
  ('compras', false, false, false, false),
  ('proveedores', false, false, false, false),
  ('clientes', true, true, false, false),
  ('fiado', true, true, false, false),
  ('caja', true, true, true, false),
  ('tasa', true, false, false, false),
  ('reportes', false, false, false, false),
  ('finanzas', false, false, false, false),
  ('facturacion', false, false, false, false),
  ('configuracion', false, false, false, false),
  ('personal', false, false, false, false)
) as m(modulo, ver, crear, editar, eliminar)
where r.tenant_id is null and r.slug = 'cajero'
on conflict (rol_id, modulo) do update set
  ver = excluded.ver, crear = excluded.crear, editar = excluded.editar, eliminar = excluded.eliminar;

-- Almacenista: control total de inventario; compras/proveedores sin eliminar.
insert into public.mm_permisos_rol (rol_id, modulo, ver, crear, editar, eliminar)
select r.id, m.modulo, m.ver, m.crear, m.editar, m.eliminar
from public.mm_roles r
cross join (values
  ('ventas', false, false, false, false),
  ('inventario', true, true, true, true),
  ('compras', true, true, true, false),
  ('proveedores', true, true, true, false),
  ('clientes', false, false, false, false),
  ('fiado', false, false, false, false),
  ('caja', false, false, false, false),
  ('tasa', false, false, false, false),
  ('reportes', false, false, false, false),
  ('finanzas', false, false, false, false),
  ('facturacion', false, false, false, false),
  ('configuracion', false, false, false, false),
  ('personal', false, false, false, false)
) as m(modulo, ver, crear, editar, eliminar)
where r.tenant_id is null and r.slug = 'almacenista'
on conflict (rol_id, modulo) do update set
  ver = excluded.ver, crear = excluded.crear, editar = excluded.editar, eliminar = excluded.eliminar;

-- --- 4) Migracion de mm_usuarios_sucursal: rol (enum) -> rol_id ----------------
alter table public.mm_usuarios_sucursal add column if not exists rol_id uuid references public.mm_roles (id);

update public.mm_usuarios_sucursal u
set rol_id = r.id
from public.mm_roles r
where u.rol_id is null
  and r.tenant_id is null
  and r.slug = case u.rol::text when 'almacen' then 'almacenista' else u.rol::text end;

alter table public.mm_usuarios_sucursal alter column rol_id set not null;
alter table public.mm_usuarios_sucursal drop column rol;
drop type if exists public.mm_rol_operativo;

create index if not exists mm_usuarios_sucursal_rol_idx on public.mm_usuarios_sucursal (rol_id);

-- --- 5) Proteccion del dueno principal: no se le puede quitar el control -------
-- El dueno principal es el profile que figura en tenants.created_by. Su fila
-- en mm_usuarios_sucursal no puede cambiar de rol, desactivarse ni borrarse
-- (ni siquiera con service_role: los triggers SI corren para ese rol, a
-- diferencia de RLS, que service_role sí salta).
create or replace function public.mm_proteger_dueno_principal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fila record;
  es_dueno_principal boolean;
  rol_dueno_id uuid;
begin
  fila := coalesce(new, old);

  select (t.created_by = fila.profile_id) into es_dueno_principal
  from public.tenants t where t.id = fila.tenant_id;

  if not coalesce(es_dueno_principal, false) then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    raise exception 'No se puede eliminar al dueno principal del negocio.';
  end if;

  select id into rol_dueno_id from public.mm_roles where slug = 'dueno' and tenant_id is null;

  if new.rol_id is distinct from rol_dueno_id then
    raise exception 'No se puede cambiar el rol del dueno principal del negocio.';
  end if;
  if new.activo = false or new.deleted_at is not null then
    raise exception 'No se puede desactivar al dueno principal del negocio.';
  end if;

  return new;
end;
$$;

drop trigger if exists mm_proteger_dueno_principal_upd on public.mm_usuarios_sucursal;
create trigger mm_proteger_dueno_principal_upd
  before update on public.mm_usuarios_sucursal
  for each row execute function public.mm_proteger_dueno_principal();

drop trigger if exists mm_proteger_dueno_principal_del on public.mm_usuarios_sucursal;
create trigger mm_proteger_dueno_principal_del
  before delete on public.mm_usuarios_sucursal
  for each row execute function public.mm_proteger_dueno_principal();

-- --- 6) RLS: mm_roles y mm_permisos_rol -----------------------------------------
alter table public.mm_roles enable row level security;
alter table public.mm_permisos_rol enable row level security;

-- Lectura: roles globales (para cualquier autenticado, catalogo de referencia)
-- o roles personalizados del propio tenant.
drop policy if exists "mm_roles_select" on public.mm_roles;
create policy "mm_roles_select" on public.mm_roles for select to authenticated
  using (tenant_id is null or tenant_id in (select public.auth_tenant_ids()));

-- Alta de roles personalizados: solo propietario/administrador de ESE tenant
-- (nunca tenant_id null: los globales no se crean desde el cliente).
drop policy if exists "mm_roles_insert" on public.mm_roles;
create policy "mm_roles_insert" on public.mm_roles for insert to authenticated
  with check (
    tenant_id is not null
    and public.auth_has_tenant_role(tenant_id, array['propietario', 'administrador']::public.membership_role[])
  );

-- Edicion/borrado: solo roles personalizados (es_sistema = false) del propio tenant.
drop policy if exists "mm_roles_update" on public.mm_roles;
create policy "mm_roles_update" on public.mm_roles for update to authenticated
  using (
    es_sistema = false and tenant_id is not null
    and public.auth_has_tenant_role(tenant_id, array['propietario', 'administrador']::public.membership_role[])
  )
  with check (es_sistema = false and tenant_id is not null);

drop policy if exists "mm_roles_delete" on public.mm_roles;
create policy "mm_roles_delete" on public.mm_roles for delete to authenticated
  using (
    es_sistema = false and tenant_id is not null
    and public.auth_has_tenant_role(tenant_id, array['propietario', 'administrador']::public.membership_role[])
  );

-- mm_permisos_rol: se autoriza a traves del rol al que pertenece cada fila.
drop policy if exists "mm_permisos_rol_select" on public.mm_permisos_rol;
create policy "mm_permisos_rol_select" on public.mm_permisos_rol for select to authenticated
  using (
    exists (
      select 1 from public.mm_roles r
      where r.id = mm_permisos_rol.rol_id
        and (r.tenant_id is null or r.tenant_id in (select public.auth_tenant_ids()))
    )
  );

drop policy if exists "mm_permisos_rol_write" on public.mm_permisos_rol;
create policy "mm_permisos_rol_write" on public.mm_permisos_rol for all to authenticated
  using (
    exists (
      select 1 from public.mm_roles r
      where r.id = mm_permisos_rol.rol_id
        and r.es_sistema = false and r.tenant_id is not null
        and public.auth_has_tenant_role(r.tenant_id, array['propietario', 'administrador']::public.membership_role[])
    )
  )
  with check (
    exists (
      select 1 from public.mm_roles r
      where r.id = mm_permisos_rol.rol_id
        and r.es_sistema = false and r.tenant_id is not null
        and public.auth_has_tenant_role(r.tenant_id, array['propietario', 'administrador']::public.membership_role[])
    )
  );

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0039_mm_roles_personal.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
