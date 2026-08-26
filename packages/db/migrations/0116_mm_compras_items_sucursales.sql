-- =============================================================================
-- 0116 · Distribución opcional de una compra entre sucursales
--
-- `mm_compras.sucursal_id` sigue siendo única y obligatoria (sucursal
-- "principal" de la compra, usada para caja/cuenta bancaria del pago — sin
-- cambios). Esta tabla es la distribución OPCIONAL por línea: cuando existen
-- filas para un `compra_item_id`, la cantidad de esa línea se reparte entre
-- esas sucursales al aplicar la recepción, en vez de ir entera a la sucursal
-- principal (ver `aplicarRecepcion` en compras/actions.ts). Sin filas para un
-- ítem (caso normal, negocio de una sola sucursal incluido), el comportamiento
-- es exactamente el de siempre: 100% a `mm_compras.sucursal_id`.
--
-- Tabla operativa mutable: mismo patrón que `mm_compras_items`
-- (0007_minimarket_rls.sql) — select/insert por tenant, sin política especial
-- por sucursal (el control real de a qué sucursal entra el stock lo impone la
-- RLS ya existente sobre `mm_movimientos_inventario`, migración 0111).
-- =============================================================================

create table if not exists public.mm_compras_items_sucursales (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  compra_item_id  uuid not null references public.mm_compras_items (id) on delete cascade,
  sucursal_id     uuid not null references public.mm_sucursales (id) on delete cascade,
  cantidad        numeric(14, 3) not null check (cantidad > 0),
  created_at      timestamptz not null default now()
);

create index if not exists mm_compras_items_sucursales_item_idx
  on public.mm_compras_items_sucursales (compra_item_id);

alter table public.mm_compras_items_sucursales enable row level security;

drop policy if exists "mm_compras_items_sucursales_select" on public.mm_compras_items_sucursales;
create policy "mm_compras_items_sucursales_select" on public.mm_compras_items_sucursales
  for select to authenticated
  using (tenant_id in (select public.auth_tenant_ids()));

drop policy if exists "mm_compras_items_sucursales_insert" on public.mm_compras_items_sucursales;
create policy "mm_compras_items_sucursales_insert" on public.mm_compras_items_sucursales
  for insert to authenticated
  with check (tenant_id in (select public.auth_tenant_ids()));
-- Sin update ni delete: la distribución de una compra ya recibida no se edita.
