-- =============================================================================
-- 0115 · Transferencias de stock entre sucursales
--
-- Cabecera + ítems de una transferencia (documento consultable en el
-- historial). El movimiento REAL de stock sigue viviendo, como siempre, en
-- `mm_movimientos_inventario` (salida en origen + entrada en destino, mismo
-- `referencia` que el id de la transferencia) — estas dos tablas nuevas son
-- solo el "documento" legible; no se toca el ledger, sus tipos, ni ninguna
-- tabla existente.
--
-- Tratadas como ledger append-only (mismo patrón que mm_movimientos_inventario/
-- mm_precios en 0007_minimarket_rls.sql): select + insert por tenant, sin
-- update/delete — una transferencia, una vez creada, ya movió stock real y no
-- se edita ni se borra.
-- =============================================================================

create table if not exists public.mm_transferencias (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  sucursal_origen_id uuid not null references public.mm_sucursales (id) on delete cascade,
  sucursal_destino_id uuid not null references public.mm_sucursales (id) on delete cascade,
  usuario_id         uuid references public.profiles (id) on delete set null,
  notas              text,
  created_at         timestamptz not null default now(),
  constraint mm_transferencias_origen_destino_distintos
    check (sucursal_origen_id <> sucursal_destino_id)
);

create index if not exists mm_transferencias_tenant_idx
  on public.mm_transferencias (tenant_id, created_at desc);

create table if not exists public.mm_transferencias_items (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  transferencia_id uuid not null references public.mm_transferencias (id) on delete cascade,
  producto_id      uuid references public.mm_productos (id) on delete set null,
  cantidad         numeric(14, 3) not null check (cantidad > 0),
  created_at       timestamptz not null default now()
);

create index if not exists mm_transferencias_items_transferencia_idx
  on public.mm_transferencias_items (transferencia_id);

do $$
declare
  t text;
  ledgers text[] := array['mm_transferencias', 'mm_transferencias_items'];
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
    -- Sin update ni delete: inmutables, igual que los demás ledgers.
  end loop;
end $$;
