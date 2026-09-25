-- =============================================================================
-- 0119 - Catalogo publico por sucursal + pedidos publicos
-- (comentarios en ASCII plano, ver 0032/0036: tildes rompen el parser al
-- copiar y pegar en el SQL Editor de Supabase).
--
-- El comerciante activa un enlace publico (/tienda/<slug>) por sucursal. El
-- cliente final arma un pedido SIN login. El pedido NO mueve stock ni dinero:
-- nace como solicitud. Solo cuando el comerciante lo valida se convierte en
-- venta real llamando a registrarVenta() del POS (sin modificarla) y guarda
-- aqui el venta_id resultante.
--
-- Seguridad:
--  * La parte publica lee/escribe SOLO desde el servidor con service_role,
--    resolviendo tenant/sucursal a partir del slug activo. No hay ninguna
--    policy para anon.
--  * mm_pedidos_publicos NO tiene policy de insert para nadie: el pedido lo
--    crea el servidor con service_role. El panel (authenticated) solo lee y
--    actualiza el estado, limitado a su tenant y a sus sucursales (mismo
--    criterio que mm_ventas en 0113).
--  * Bucket privado de comprobantes: lectura solo para el tenant dueno
--    (carpeta 1 = tenant_id), sin policy de insert (sube el servidor).
--
-- Idempotente: se puede ejecutar mas de una vez sin error.
-- =============================================================================

-- --- Descripcion opcional del producto (visible en la tienda) --------------------
alter table public.mm_productos add column if not exists descripcion text;

-- --- Enums ------------------------------------------------------------------------
do $$ begin
  create type public.mm_pedido_publico_estado as enum (
    'pendiente', 'pago_reportado', 'para_pagar_local', 'aceptado_validado', 'rechazado', 'completado'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.mm_pedido_forma_pago as enum ('online', 'local');
exception when duplicate_object then null; end $$;

-- --- Catalogo publico (uno por sucursal) --------------------------------------------
create table if not exists public.mm_catalogo_publico (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  sucursal_id uuid not null references public.mm_sucursales (id) on delete cascade,
  slug        text not null,
  activo      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint mm_catalogo_publico_slug_formato
    check (char_length(slug) between 3 and 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint mm_catalogo_publico_tenant_sucursal_key unique (tenant_id, sucursal_id)
);
create unique index if not exists mm_catalogo_publico_slug_key
  on public.mm_catalogo_publico (slug);
create index if not exists mm_catalogo_publico_slug_activo_idx
  on public.mm_catalogo_publico (slug) where activo;

drop trigger if exists set_mm_catalogo_publico_updated_at on public.mm_catalogo_publico;
create trigger set_mm_catalogo_publico_updated_at before update on public.mm_catalogo_publico
  for each row execute function public.set_updated_at();

alter table public.mm_catalogo_publico enable row level security;

drop policy if exists "mm_catalogo_publico_select" on public.mm_catalogo_publico;
create policy "mm_catalogo_publico_select" on public.mm_catalogo_publico for select to authenticated
  using (tenant_id in (select public.auth_tenant_ids()));

drop policy if exists "mm_catalogo_publico_insert" on public.mm_catalogo_publico;
create policy "mm_catalogo_publico_insert" on public.mm_catalogo_publico for insert to authenticated
  with check (tenant_id in (select public.auth_tenant_ids()));

drop policy if exists "mm_catalogo_publico_update" on public.mm_catalogo_publico;
create policy "mm_catalogo_publico_update" on public.mm_catalogo_publico for update to authenticated
  using (tenant_id in (select public.auth_tenant_ids()))
  with check (tenant_id in (select public.auth_tenant_ids()));

-- --- Pedidos publicos (cabecera) ----------------------------------------------------
create table if not exists public.mm_pedidos_publicos (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  sucursal_id         uuid not null references public.mm_sucursales (id) on delete cascade,
  numero              integer not null check (numero > 0),
  cliente_nombre      text not null check (char_length(cliente_nombre) between 2 and 120),
  cliente_telefono    text not null check (char_length(cliente_telefono) between 7 and 30),
  forma_pago          public.mm_pedido_forma_pago not null,
  metodo_pago_elegido text not null,
  cuenta_bancaria_id  uuid references public.mm_cuentas_bancarias (id) on delete set null,
  comprobante_path    text,
  -- Lo que el cliente dice que llevara en efectivo (en la moneda del metodo).
  monto_entregado     numeric(16, 2) check (monto_entregado is null or monto_entregado >= 0),
  -- Snapshot INFORMATIVO al crear el pedido (la venta real recalcula todo).
  subtotal_usd        numeric(14, 2) not null default 0,
  iva_usd             numeric(14, 2) not null default 0,
  igtf_usd            numeric(14, 2) not null default 0,
  total_usd           numeric(14, 2) not null default 0,
  total_bs            numeric(16, 2) not null default 0,
  tasa_usada          numeric(18, 6) not null,
  estado              public.mm_pedido_publico_estado not null,
  motivo_rechazo      text,
  venta_id            uuid references public.mm_ventas (id) on delete set null,
  usuario_valido_id   uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint mm_pedidos_publicos_tenant_numero_key unique (tenant_id, numero)
);
create index if not exists mm_pedidos_publicos_tenant_fecha_idx
  on public.mm_pedidos_publicos (tenant_id, created_at desc);
create index if not exists mm_pedidos_publicos_tenant_estado_idx
  on public.mm_pedidos_publicos (tenant_id, estado);
create index if not exists mm_pedidos_publicos_sucursal_idx
  on public.mm_pedidos_publicos (sucursal_id);

drop trigger if exists set_mm_pedidos_publicos_updated_at on public.mm_pedidos_publicos;
create trigger set_mm_pedidos_publicos_updated_at before update on public.mm_pedidos_publicos
  for each row execute function public.set_updated_at();

alter table public.mm_pedidos_publicos enable row level security;

drop policy if exists "mm_pedidos_publicos_select" on public.mm_pedidos_publicos;
create policy "mm_pedidos_publicos_select" on public.mm_pedidos_publicos for select to authenticated
  using (
    tenant_id in (select public.auth_tenant_ids())
    and sucursal_id in (select public.auth_sucursal_ids(tenant_id))
  );

drop policy if exists "mm_pedidos_publicos_update" on public.mm_pedidos_publicos;
create policy "mm_pedidos_publicos_update" on public.mm_pedidos_publicos for update to authenticated
  using (
    tenant_id in (select public.auth_tenant_ids())
    and sucursal_id in (select public.auth_sucursal_ids(tenant_id))
  )
  with check (
    tenant_id in (select public.auth_tenant_ids())
    and sucursal_id in (select public.auth_sucursal_ids(tenant_id))
  );
-- Sin policy de insert ni delete: el pedido lo crea el servidor (service_role).

-- --- Items del pedido ---------------------------------------------------------------
create table if not exists public.mm_pedidos_publicos_items (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  pedido_id       uuid not null references public.mm_pedidos_publicos (id) on delete cascade,
  producto_id     uuid references public.mm_productos (id) on delete set null,
  producto_nombre text not null,
  cantidad        numeric(14, 3) not null check (cantidad > 0),
  precio_usd      numeric(14, 2) not null check (precio_usd >= 0),
  total_usd       numeric(14, 2) not null,
  created_at      timestamptz not null default now()
);
create index if not exists mm_pedidos_publicos_items_pedido_idx
  on public.mm_pedidos_publicos_items (pedido_id);

alter table public.mm_pedidos_publicos_items enable row level security;

drop policy if exists "mm_pedidos_publicos_items_select" on public.mm_pedidos_publicos_items;
create policy "mm_pedidos_publicos_items_select" on public.mm_pedidos_publicos_items
  for select to authenticated
  using (
    tenant_id in (select public.auth_tenant_ids())
    and exists (
      select 1 from public.mm_pedidos_publicos p
      where p.id = pedido_id
        and p.sucursal_id in (select public.auth_sucursal_ids(p.tenant_id))
    )
  );

-- --- Bucket privado de comprobantes -------------------------------------------------
insert into storage.buckets (id, name, public)
values ('comprobantes-pedidos-publicos', 'comprobantes-pedidos-publicos', false)
on conflict (id) do nothing;

drop policy if exists "mm_comprobantes_pedidos_read" on storage.objects;
create policy "mm_comprobantes_pedidos_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'comprobantes-pedidos-publicos'
    and exists (
      select 1 from public.auth_tenant_ids() t where t::text = (storage.foldername(name))[1]
    )
  );
-- Sin policy de insert/update/delete: el servidor sube y borra con service_role.

-- --- Permisos: nuevo modulo 'pedidos' en mm_permisos_rol ----------------------------
alter table public.mm_permisos_rol drop constraint if exists mm_permisos_rol_modulo_check;
alter table public.mm_permisos_rol add constraint mm_permisos_rol_modulo_check
  check (modulo in (
    'ventas', 'inventario', 'compras', 'proveedores', 'clientes', 'fiado', 'caja',
    'tasa', 'reportes', 'finanzas', 'facturacion', 'configuracion', 'personal', 'deudas',
    'bancos', 'presupuestos', 'pedidos'
  ));

-- Dueno y administrador: todo.
insert into public.mm_permisos_rol (rol_id, modulo, ver, crear, editar, eliminar)
select r.id, 'pedidos', true, true, true, true
from public.mm_roles r
where r.tenant_id is null and r.slug in ('dueno', 'administrador')
on conflict (rol_id, modulo) do update set
  ver = excluded.ver, crear = excluded.crear, editar = excluded.editar, eliminar = excluded.eliminar;

-- Supervisor: ver, crear (activar catalogo) y editar (validar/cobrar/rechazar).
insert into public.mm_permisos_rol (rol_id, modulo, ver, crear, editar, eliminar)
select r.id, 'pedidos', true, true, true, false
from public.mm_roles r
where r.tenant_id is null and r.slug = 'supervisor'
on conflict (rol_id, modulo) do update set
  ver = excluded.ver, crear = excluded.crear, editar = excluded.editar, eliminar = excluded.eliminar;

-- Cajero: ver y editar (valida y cobra), no activa el catalogo.
insert into public.mm_permisos_rol (rol_id, modulo, ver, crear, editar, eliminar)
select r.id, 'pedidos', true, false, true, false
from public.mm_roles r
where r.tenant_id is null and r.slug = 'cajero'
on conflict (rol_id, modulo) do update set
  ver = excluded.ver, crear = excluded.crear, editar = excluded.editar, eliminar = excluded.eliminar;

-- Almacenista: solo ver.
insert into public.mm_permisos_rol (rol_id, modulo, ver, crear, editar, eliminar)
select r.id, 'pedidos', true, false, false, false
from public.mm_roles r
where r.tenant_id is null and r.slug = 'almacenista'
on conflict (rol_id, modulo) do update set
  ver = excluded.ver, crear = excluded.crear, editar = excluded.editar, eliminar = excluded.eliminar;

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0119_mm_catalogo_publico_pedidos.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
