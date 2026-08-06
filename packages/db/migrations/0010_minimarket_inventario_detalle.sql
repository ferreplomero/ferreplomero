-- =============================================================================
-- 0010 · Inventario premium (sección 6.1) — tipo de venta, IGTF por producto,
-- proveedor habitual y múltiples códigos de barras por producto.
-- Idempotente.
-- =============================================================================

-- Tipo de venta: por unidad o a granel (por peso).
do $$ begin
  create type public.mm_tipo_venta as enum ('unidad', 'granel');
exception when duplicate_object then null; end $$;

alter table public.mm_productos
  add column if not exists tipo_venta public.mm_tipo_venta not null default 'unidad',
  add column if not exists aplica_igtf boolean not null default true,
  add column if not exists proveedor_id uuid references public.mm_proveedores (id) on delete set null;

create index if not exists mm_productos_proveedor_idx on public.mm_productos (proveedor_id);

-- Varios códigos de barras por producto (un producto puede tener presentaciones).
create table if not exists public.mm_producto_codigos (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  producto_id uuid not null references public.mm_productos (id) on delete cascade,
  codigo      text not null check (char_length(codigo) between 1 and 64),
  created_at  timestamptz not null default now()
);
create index if not exists mm_producto_codigos_producto_idx
  on public.mm_producto_codigos (tenant_id, producto_id);
create unique index if not exists mm_producto_codigos_unico
  on public.mm_producto_codigos (tenant_id, codigo);

-- Migra el código de barras principal existente a la tabla de códigos (una vez).
insert into public.mm_producto_codigos (tenant_id, producto_id, codigo)
select p.tenant_id, p.id, p.codigo_barras
from public.mm_productos p
where p.codigo_barras is not null
  and p.deleted_at is null
  and not exists (
    select 1 from public.mm_producto_codigos c
    where c.tenant_id = p.tenant_id and c.codigo = p.codigo_barras
  );

-- RLS: tabla operativa mutable (select/insert/update/delete por pertenencia al tenant).
alter table public.mm_producto_codigos enable row level security;

drop policy if exists "mm_producto_codigos_select" on public.mm_producto_codigos;
create policy "mm_producto_codigos_select" on public.mm_producto_codigos for select to authenticated
  using (tenant_id in (select public.auth_tenant_ids()));

drop policy if exists "mm_producto_codigos_insert" on public.mm_producto_codigos;
create policy "mm_producto_codigos_insert" on public.mm_producto_codigos for insert to authenticated
  with check (tenant_id in (select public.auth_tenant_ids()));

drop policy if exists "mm_producto_codigos_update" on public.mm_producto_codigos;
create policy "mm_producto_codigos_update" on public.mm_producto_codigos for update to authenticated
  using (tenant_id in (select public.auth_tenant_ids()))
  with check (tenant_id in (select public.auth_tenant_ids()));

-- Aquí sí se permite delete físico: quitar un código de barras es una acción normal.
drop policy if exists "mm_producto_codigos_delete" on public.mm_producto_codigos;
create policy "mm_producto_codigos_delete" on public.mm_producto_codigos for delete to authenticated
  using (tenant_id in (select public.auth_tenant_ids()));
