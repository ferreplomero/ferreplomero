-- =============================================================================
-- 0102 - Modulo Presupuestos (cotizaciones) del minimarket -- comentarios en
-- ASCII plano a proposito, ver 0032/0033/0035/0036/0037/0046.
--
-- Un presupuesto es una OFERTA de precios al cliente, NO una venta: mientras
-- esta pendiente no descuenta inventario, no registra dinero en caja/bancos y
-- no genera deuda de fiado. Es solo un documento. Precedente exacto en el
-- repo: mm_ventas_pendientes (0037) + retomarVentaPendiente() en
-- pos-cliente.tsx -- un "borrador" que se hidrata en el carrito del POS y de
-- ahi sigue el camino normal de cobro (registrarVenta). Presupuestos usa el
-- MISMO mecanismo de hidratacion para convertirse en venta, en vez de un
-- flujo de cobro paralelo -- ver apps/web/app/(vertical)/minimarket/ventas/nueva/page.tsx
-- y apps/web/components/minimarket/pos/pos-cliente.tsx.
--
-- Diferencia deliberada con mm_ventas_items: aqui el precio unitario que
-- escribe el usuario (precio_unitario_usd) SI se guarda tal cual, sin
-- recalcularlo desde el catalogo -- es la caracteristica pedida (precios
-- editables, mayoristas o los que el negocio decida). No mueve dinero ni
-- inventario, asi que no aplica el mismo criterio de seguridad que en una
-- venta real (registrarVenta SIEMPRE recalcula precios desde mm_productos).
--
-- A diferencia de mm_ventas_pendientes (borrador efimero con DELETE fisico),
-- un presupuesto es un documento numerado (como una venta) que vale la pena
-- conservar en auditoria: usa borrado logico via deleted_at, igual que el
-- resto de las tablas mm_*.
--
-- "vencido" NO es un estado guardado: se calcula en la app comparando
-- validez_hasta con la fecha actual, exactamente igual que "vencida" en
-- mm_deudas (0046) y "moroso" en clientes.
-- =============================================================================

do $$ begin
  create type public.mm_presupuesto_estado as enum ('pendiente', 'convertido', 'rechazado');
exception when duplicate_object then null; end $$;

-- --- Presupuestos (cabecera) -----------------------------------------------------
create table if not exists public.mm_presupuestos (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants (id) on delete cascade,
  sucursal_id             uuid not null references public.mm_sucursales (id) on delete cascade,
  numero                  text not null,
  cliente_id              uuid references public.mm_clientes (id) on delete set null,
  cliente_nombre_manual   text,
  cliente_cedula_manual   text,
  cliente_telefono_manual text,
  fecha_emision           date not null default current_date,
  validez_hasta           date not null,
  tasa_tipo               text not null default 'bcv' check (tasa_tipo in ('bcv', 'euro', 'manual')),
  tasa_usada              numeric(18, 6) not null,
  subtotal_usd            numeric(14, 2) not null default 0,
  iva_usd                 numeric(14, 2) not null default 0,
  total_usd               numeric(14, 2) not null default 0,
  total_bs                numeric(16, 2) not null default 0,
  estado                  public.mm_presupuesto_estado not null default 'pendiente',
  venta_id                uuid references public.mm_ventas (id) on delete set null,
  notas                   text,
  usuario_id              uuid references public.profiles (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  deleted_at              timestamptz
);
create unique index if not exists mm_presupuestos_tenant_numero_key
  on public.mm_presupuestos (tenant_id, numero) where deleted_at is null;
create index if not exists mm_presupuestos_tenant_idx
  on public.mm_presupuestos (tenant_id, created_at desc);
create index if not exists mm_presupuestos_cliente_idx on public.mm_presupuestos (cliente_id);

drop trigger if exists set_mm_presupuestos_updated_at on public.mm_presupuestos;
create trigger set_mm_presupuestos_updated_at before update on public.mm_presupuestos
  for each row execute function public.set_updated_at();

-- --- Items del presupuesto --------------------------------------------------------
create table if not exists public.mm_presupuestos_items (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  presupuesto_id      uuid not null references public.mm_presupuestos (id) on delete cascade,
  producto_id         uuid not null references public.mm_productos (id),
  descripcion         text not null,
  cantidad            numeric(14, 3) not null check (cantidad > 0),
  precio_lista_usd    numeric(14, 2) not null,
  precio_unitario_usd numeric(14, 2) not null check (precio_unitario_usd >= 0),
  precio_ajustado     boolean not null default false,
  subtotal_usd        numeric(14, 2) not null,
  created_at          timestamptz not null default now()
);
create index if not exists mm_presupuestos_items_presupuesto_idx
  on public.mm_presupuestos_items (presupuesto_id);
create index if not exists mm_presupuestos_items_tenant_idx
  on public.mm_presupuestos_items (tenant_id);

-- --- RLS: cabecera + items, mismo patron que 0046_mm_deudas.sql ------------------
do $$
declare
  t text;
  tablas text[] := array['mm_presupuestos', 'mm_presupuestos_items'];
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

-- --- Permisos: nuevo modulo 'presupuestos' en mm_permisos_rol ---------------------
alter table public.mm_permisos_rol drop constraint if exists mm_permisos_rol_modulo_check;
alter table public.mm_permisos_rol add constraint mm_permisos_rol_modulo_check
  check (modulo in (
    'ventas', 'inventario', 'compras', 'proveedores', 'clientes', 'fiado', 'caja',
    'tasa', 'reportes', 'finanzas', 'facturacion', 'configuracion', 'personal', 'deudas',
    'bancos', 'presupuestos'
  ));

-- Dueno y administrador: acceso total.
insert into public.mm_permisos_rol (rol_id, modulo, ver, crear, editar, eliminar)
select r.id, 'presupuestos', true, true, true, true
from public.mm_roles r
where r.tenant_id is null and r.slug in ('dueno', 'administrador')
on conflict (rol_id, modulo) do update set
  ver = excluded.ver, crear = excluded.crear, editar = excluded.editar, eliminar = excluded.eliminar;

-- Supervisor: ve, crea y edita presupuestos, nunca elimina (mismo criterio que ventas).
insert into public.mm_permisos_rol (rol_id, modulo, ver, crear, editar, eliminar)
select r.id, 'presupuestos', true, true, true, false
from public.mm_roles r
where r.tenant_id is null and r.slug = 'supervisor'
on conflict (rol_id, modulo) do update set
  ver = excluded.ver, crear = excluded.crear, editar = excluded.editar, eliminar = excluded.eliminar;

-- Cajero: puede cotizar (ver/crear), no edita ni elimina presupuestos ya
-- creados -- mismo patron que 'ventas' (crear=true, editar=false). Convertir
-- un presupuesto en venta solo requiere 'presupuestos.crear' salvo que tenga
-- precios ajustados, en cuyo caso ademas se exige 'ventas.editar' (logica en
-- la app, ver prepararConversionPresupuesto en presupuestos/actions.ts) --
-- evita que un cajero sin permiso de ajustar precios convierta un
-- presupuesto con precio mayorista y el sistema cobre en silencio el precio
-- de catalogo (mismo riesgo que existe hoy en registrarVenta con
-- precio_usd_override, ver ventas/actions.ts).
insert into public.mm_permisos_rol (rol_id, modulo, ver, crear, editar, eliminar)
select r.id, 'presupuestos', true, true, false, false
from public.mm_roles r
where r.tenant_id is null and r.slug = 'cajero'
on conflict (rol_id, modulo) do update set
  ver = excluded.ver, crear = excluded.crear, editar = excluded.editar, eliminar = excluded.eliminar;

-- Almacenista: sin acceso (no vende ni cotiza).
insert into public.mm_permisos_rol (rol_id, modulo, ver, crear, editar, eliminar)
select r.id, 'presupuestos', false, false, false, false
from public.mm_roles r
where r.tenant_id is null and r.slug = 'almacenista'
on conflict (rol_id, modulo) do update set
  ver = excluded.ver, crear = excluded.crear, editar = excluded.editar, eliminar = excluded.eliminar;

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0102_mm_presupuestos.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
