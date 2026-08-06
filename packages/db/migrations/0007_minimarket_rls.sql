-- =============================================================================
-- 0007 · Row-Level Security del vertical Minimarket
-- Aislamiento por inquilino reutilizando los helpers de 0003:
--   public.auth_tenant_ids()         -> tenants del usuario autenticado
--   public.auth_has_tenant_role(...) -> rol de gestión (propietario/administrador)
--
-- Tres patrones:
--   1. Tablas operativas mutables  -> select/insert/update por pertenencia al tenant.
--   2. Ledgers append-only         -> solo select + insert (inmutables).
--   3. Config/estructura           -> lectura por tenant; escritura solo gestión.
--
-- La LECTURA offline la sirve PowerSync vía Sync Rules (no estas políticas); RLS
-- protege el write-path (supabase-js como usuario autenticado) y PostgREST.
-- =============================================================================

-- 1) Tablas operativas mutables --------------------------------------------------
do $$
declare
  t text;
  tablas text[] := array[
    'mm_categorias', 'mm_productos', 'mm_inventario', 'mm_proveedores',
    'mm_compras', 'mm_compras_items', 'mm_clientes', 'mm_fiados',
    'mm_ventas', 'mm_ventas_items', 'mm_caja_sesiones'
  ];
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
    -- Sin política DELETE: el borrado es lógico (deleted_at), no físico.
  end loop;
end $$;

-- 2) Ledgers append-only (solo select + insert) ---------------------------------
do $$
declare
  t text;
  ledgers text[] := array[
    'mm_precios', 'mm_movimientos_inventario', 'mm_abonos_fiado',
    'mm_pagos_venta', 'mm_caja_movimientos', 'mm_tasas_cambio'
  ];
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
    -- Sin update ni delete: inmutables.
  end loop;
end $$;

-- 3) Configuración / estructura (escritura solo gestión) ------------------------
do $$
declare
  t text;
  config text[] := array['mm_config_negocio', 'mm_sucursales', 'mm_usuarios_sucursal'];
begin
  foreach t in array config loop
    execute format('alter table public.%I enable row level security', t);

    -- Lectura: cualquier miembro del tenant.
    execute format('drop policy if exists "%1$s_select" on public.%1$s', t);
    execute format(
      'create policy "%1$s_select" on public.%1$s for select to authenticated
         using (tenant_id in (select public.auth_tenant_ids()))', t);

    -- Inserción: solo propietario/administrador del tenant.
    execute format('drop policy if exists "%1$s_insert" on public.%1$s', t);
    execute format(
      'create policy "%1$s_insert" on public.%1$s for insert to authenticated
         with check (public.auth_has_tenant_role(
           tenant_id, array[''propietario'', ''administrador'']::public.membership_role[]))', t);

    -- Actualización: solo propietario/administrador del tenant.
    execute format('drop policy if exists "%1$s_update" on public.%1$s', t);
    execute format(
      'create policy "%1$s_update" on public.%1$s for update to authenticated
         using (public.auth_has_tenant_role(
           tenant_id, array[''propietario'', ''administrador'']::public.membership_role[]))
         with check (public.auth_has_tenant_role(
           tenant_id, array[''propietario'', ''administrador'']::public.membership_role[]))', t);
  end loop;
end $$;
