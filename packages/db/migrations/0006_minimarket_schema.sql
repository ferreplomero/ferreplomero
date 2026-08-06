-- =============================================================================
-- 0006 · Esquema del vertical Minimarket
-- Todas las tablas llevan tenant_id (RLS en 0007). Diseñadas para sincronización
-- offline-first: columnas updated_at/deleted_at en tablas mutables y ledgers
-- append-only (solo created_at) como fuente de verdad de stock, caja y fiado.
-- El stock y el saldo de clientes NO se almacenan como contadores: se derivan
-- de los ledgers mediante vistas, para que el sync no corrompa cifras.
-- =============================================================================

-- =========================== Estructura / configuración ======================

-- Sucursales del negocio (un tenant puede tener varias).
create table if not exists public.mm_sucursales (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  nombre      text not null check (char_length(nombre) between 1 and 120),
  direccion   text,
  telefono    text,
  activa      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists mm_sucursales_tenant_idx on public.mm_sucursales (tenant_id);

-- Asignación de usuarios a sucursales con su rol operativo.
create table if not exists public.mm_usuarios_sucursal (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  sucursal_id uuid not null references public.mm_sucursales (id) on delete cascade,
  rol         public.mm_rol_operativo not null default 'cajero',
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (tenant_id, profile_id, sucursal_id)
);
create index if not exists mm_usuarios_sucursal_tenant_idx on public.mm_usuarios_sucursal (tenant_id);
create index if not exists mm_usuarios_sucursal_profile_idx on public.mm_usuarios_sucursal (profile_id);

-- Configuración del negocio (una fila por tenant). Datos fiscales preparados
-- pero inactivos hasta la capa fiscal SENIAT futura.
create table if not exists public.mm_config_negocio (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  nombre_comercial text not null default '',
  rif             text,
  direccion       text,
  logo_url        text,
  datos_fiscales  jsonb not null default '{}'::jsonb,
  fuente_tasa     text not null default 'manual',
  metodos_pago    jsonb not null default '[]'::jsonb,
  parametros      jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id)
);

-- =============================== Catálogo / inventario =======================

create table if not exists public.mm_categorias (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  nombre      text not null check (char_length(nombre) between 1 and 80),
  orden       integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists mm_categorias_tenant_idx on public.mm_categorias (tenant_id);

-- Productos. Precio base en USD; el valor en Bs se deriva por la tasa vigente.
create table if not exists public.mm_productos (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  codigo        text,
  nombre        text not null check (char_length(nombre) between 1 and 160),
  categoria_id  uuid references public.mm_categorias (id) on delete set null,
  unidad        text not null default 'unidad',
  precio_usd    numeric(12, 2) not null default 0 check (precio_usd >= 0),
  impuesto_id   text not null default 'iva',
  imagen_url    text,
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists mm_productos_tenant_idx on public.mm_productos (tenant_id);
create index if not exists mm_productos_categoria_idx on public.mm_productos (categoria_id);
-- Código único por tenant cuando está presente (permite varios productos sin código).
create unique index if not exists mm_productos_codigo_unico
  on public.mm_productos (tenant_id, codigo) where codigo is not null and deleted_at is null;

-- Histórico de precios (append-only): nunca se edita, se agrega una nueva fila.
create table if not exists public.mm_precios (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  producto_id   uuid not null references public.mm_productos (id) on delete cascade,
  precio_usd    numeric(12, 2) not null check (precio_usd >= 0),
  vigente_desde timestamptz not null default now(),
  usuario_id    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists mm_precios_producto_idx on public.mm_precios (tenant_id, producto_id);

-- Configuración de inventario por producto/sucursal (stock_minimo). El stock
-- actual se deriva de mm_movimientos_inventario (vista mm_v_stock).
create table if not exists public.mm_inventario (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  producto_id   uuid not null references public.mm_productos (id) on delete cascade,
  sucursal_id   uuid not null references public.mm_sucursales (id) on delete cascade,
  stock_minimo  numeric(14, 3) not null default 0 check (stock_minimo >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (tenant_id, producto_id, sucursal_id)
);
create index if not exists mm_inventario_tenant_idx on public.mm_inventario (tenant_id);

-- Ledger append-only de movimientos de inventario: FUENTE DE VERDAD del stock.
-- `cantidad` es un delta con signo (entrada/ajuste+ positivo; salida/merma negativo).
create table if not exists public.mm_movimientos_inventario (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  producto_id   uuid not null references public.mm_productos (id) on delete cascade,
  sucursal_id   uuid not null references public.mm_sucursales (id) on delete cascade,
  tipo          public.mm_mov_tipo not null,
  cantidad      numeric(14, 3) not null,
  motivo        text,
  referencia    uuid,
  usuario_id    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists mm_mov_inv_stock_idx
  on public.mm_movimientos_inventario (tenant_id, producto_id, sucursal_id);

-- ================================ Compras / proveedores ======================

create table if not exists public.mm_proveedores (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  nombre      text not null check (char_length(nombre) between 1 and 160),
  contacto    text,
  telefono    text,
  notas       text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists mm_proveedores_tenant_idx on public.mm_proveedores (tenant_id);

create table if not exists public.mm_compras (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  proveedor_id uuid references public.mm_proveedores (id) on delete set null,
  sucursal_id  uuid not null references public.mm_sucursales (id) on delete cascade,
  fecha        timestamptz not null default now(),
  total_usd    numeric(14, 2) not null default 0 check (total_usd >= 0),
  estado       public.mm_compra_estado not null default 'borrador',
  usuario_id   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists mm_compras_tenant_idx on public.mm_compras (tenant_id);

create table if not exists public.mm_compras_items (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  compra_id       uuid not null references public.mm_compras (id) on delete cascade,
  producto_id     uuid references public.mm_productos (id) on delete set null,
  cantidad        numeric(14, 3) not null check (cantidad > 0),
  costo_unitario_usd numeric(12, 2) not null default 0 check (costo_unitario_usd >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index if not exists mm_compras_items_compra_idx on public.mm_compras_items (tenant_id, compra_id);

-- ================================ Clientes / fiado ===========================

create table if not exists public.mm_clientes (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  nombre           text not null check (char_length(nombre) between 1 and 160),
  telefono         text,
  whatsapp         text,
  limite_fiado_usd numeric(14, 2) not null default 0 check (limite_fiado_usd >= 0),
  notas            text,
  activo           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index if not exists mm_clientes_tenant_idx on public.mm_clientes (tenant_id);

create table if not exists public.mm_fiados (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  cliente_id  uuid not null references public.mm_clientes (id) on delete cascade,
  venta_id    uuid,
  monto_usd   numeric(14, 2) not null check (monto_usd >= 0),
  estado      public.mm_fiado_estado not null default 'abierto',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists mm_fiados_cliente_idx on public.mm_fiados (tenant_id, cliente_id);

-- Abonos a cuentas por cobrar (append-only).
create table if not exists public.mm_abonos_fiado (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  fiado_id    uuid not null references public.mm_fiados (id) on delete cascade,
  cliente_id  uuid not null references public.mm_clientes (id) on delete cascade,
  monto_usd   numeric(14, 2) not null check (monto_usd > 0),
  monto_bs    numeric(16, 2),
  tasa_usada  numeric(18, 6),
  metodo      public.mm_metodo_pago not null default 'efectivo_usd',
  usuario_id  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists mm_abonos_fiado_idx on public.mm_abonos_fiado (tenant_id, fiado_id);

-- =================================== Ventas ==================================

-- Cada venta CONGELA su tasa (tasa_usada). Los reportes históricos usan esa tasa.
create table if not exists public.mm_ventas (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  sucursal_id      uuid not null references public.mm_sucursales (id) on delete cascade,
  usuario_id       uuid references public.profiles (id) on delete set null,
  cliente_id       uuid references public.mm_clientes (id) on delete set null,
  fecha            timestamptz not null default now(),
  tasa_usada       numeric(18, 6) not null,
  subtotal_usd     numeric(14, 2) not null default 0,
  igtf_usd         numeric(14, 2) not null default 0,
  total_usd        numeric(14, 2) not null default 0,
  total_bs         numeric(16, 2) not null default 0,
  tipo_documento   public.mm_doc_tipo not null default 'recibo',
  numero_documento text,
  estado           public.mm_venta_estado not null default 'completada',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index if not exists mm_ventas_tenant_fecha_idx on public.mm_ventas (tenant_id, fecha);
create index if not exists mm_ventas_sucursal_idx on public.mm_ventas (sucursal_id);

create table if not exists public.mm_ventas_items (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  venta_id     uuid not null references public.mm_ventas (id) on delete cascade,
  producto_id  uuid references public.mm_productos (id) on delete set null,
  descripcion  text not null,
  cantidad     numeric(14, 3) not null check (cantidad > 0),
  precio_usd   numeric(12, 2) not null check (precio_usd >= 0),
  impuesto_id  text not null default 'iva',
  total_usd    numeric(14, 2) not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists mm_ventas_items_venta_idx on public.mm_ventas_items (tenant_id, venta_id);

-- Pagos de una venta (append-only). Soporta pago mixto: varias filas por venta.
create table if not exists public.mm_pagos_venta (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  venta_id    uuid not null references public.mm_ventas (id) on delete cascade,
  metodo      public.mm_metodo_pago not null,
  monto       numeric(16, 2) not null check (monto >= 0),
  moneda      text not null default 'USD',
  tasa_usada  numeric(18, 6),
  created_at  timestamptz not null default now()
);
create index if not exists mm_pagos_venta_idx on public.mm_pagos_venta (tenant_id, venta_id);

-- ==================================== Caja ===================================

create table if not exists public.mm_caja_sesiones (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  sucursal_id        uuid not null references public.mm_sucursales (id) on delete cascade,
  usuario_id         uuid references public.profiles (id) on delete set null,
  monto_inicial_usd  numeric(14, 2) not null default 0,
  monto_inicial_bs   numeric(16, 2) not null default 0,
  monto_final_usd    numeric(14, 2),
  monto_final_bs     numeric(16, 2),
  diferencia_usd     numeric(14, 2),
  diferencia_bs      numeric(16, 2),
  estado             public.mm_caja_estado not null default 'abierta',
  abierta_en         timestamptz not null default now(),
  cerrada_en         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);
create index if not exists mm_caja_sesiones_idx on public.mm_caja_sesiones (tenant_id, sucursal_id);

-- Movimientos de caja (append-only).
create table if not exists public.mm_caja_movimientos (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  sesion_id   uuid not null references public.mm_caja_sesiones (id) on delete cascade,
  tipo        public.mm_caja_mov_tipo not null,
  monto       numeric(16, 2) not null,
  moneda      text not null default 'USD',
  motivo      text,
  referencia  uuid,
  usuario_id  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists mm_caja_movimientos_idx on public.mm_caja_movimientos (tenant_id, sesion_id);

-- ================================ Tasa de cambio =============================

-- Historial de tasas (append-only). La tasa vigente se resuelve en el servicio
-- (el override manual del día prevalece sobre la automática).
create table if not exists public.mm_tasas_cambio (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  fecha       date not null default current_date,
  valor       numeric(18, 6) not null check (valor > 0),
  fuente      public.mm_tasa_fuente not null,
  usuario_id  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists mm_tasas_cambio_idx on public.mm_tasas_cambio (tenant_id, fecha desc, created_at desc);

-- ============================ Triggers updated_at ============================

do $$
declare
  t text;
  mutables text[] := array[
    'mm_sucursales', 'mm_usuarios_sucursal', 'mm_config_negocio', 'mm_categorias',
    'mm_productos', 'mm_inventario', 'mm_proveedores', 'mm_compras', 'mm_compras_items',
    'mm_clientes', 'mm_fiados', 'mm_ventas', 'mm_caja_sesiones'
  ];
begin
  foreach t in array mutables loop
    execute format('drop trigger if exists set_%1$s_updated_at on public.%1$s', t);
    execute format(
      'create trigger set_%1$s_updated_at before update on public.%1$s
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ============================== Vistas derivadas =============================
-- security_invoker = true: la vista respeta las políticas RLS del usuario que
-- consulta (no las del dueño de la vista). Imprescindible para el aislamiento.

create or replace view public.mm_v_stock
  with (security_invoker = true) as
  select
    tenant_id,
    producto_id,
    sucursal_id,
    coalesce(sum(cantidad), 0) as stock_actual
  from public.mm_movimientos_inventario
  group by tenant_id, producto_id, sucursal_id;

create or replace view public.mm_v_saldo_cliente
  with (security_invoker = true) as
  select
    c.tenant_id,
    c.id as cliente_id,
    coalesce(f.total_fiado, 0) - coalesce(a.total_abonado, 0) as saldo_usd
  from public.mm_clientes c
  left join (
    select tenant_id, cliente_id, sum(monto_usd) as total_fiado
    from public.mm_fiados
    where estado <> 'anulado' and deleted_at is null
    group by tenant_id, cliente_id
  ) f on f.tenant_id = c.tenant_id and f.cliente_id = c.id
  left join (
    select tenant_id, cliente_id, sum(monto_usd) as total_abonado
    from public.mm_abonos_fiado
    group by tenant_id, cliente_id
  ) a on a.tenant_id = c.tenant_id and a.cliente_id = c.id
  where c.deleted_at is null;
