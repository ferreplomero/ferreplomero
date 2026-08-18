-- =============================================================================
-- 0114 · Aislamiento por sucursal en RLS (caja)
--
-- Fase 3. mm_caja_sesiones tiene sucursal_id NOT NULL desde el esquema
-- original (0006), pero su RLS (0007) solo filtraba por tenant_id -- igual
-- que le pasaba a mm_ventas antes de 0113. Cualquier usuario con acceso a
-- CUALQUIER sucursal del tenant podia leer, abrir, cerrar o mover la caja de
-- otra sucursal ajena.
--
-- Esta migracion extiende el MISMO patron de 0111/0113 a mm_caja_sesiones y
-- mm_caja_movimientos -- misma funcion auth_sucursal_ids().
-- =============================================================================

-- mm_caja_sesiones SI tiene sucursal_id propio: mismo patron exacto que
-- mm_inventario en 0111 / mm_ventas en 0113 (select/insert/update, tabla
-- operativa mutable).
drop policy if exists "mm_caja_sesiones_select" on public.mm_caja_sesiones;
create policy "mm_caja_sesiones_select" on public.mm_caja_sesiones for select to authenticated
  using (
    tenant_id in (select public.auth_tenant_ids())
    and sucursal_id in (select public.auth_sucursal_ids(tenant_id))
  );

drop policy if exists "mm_caja_sesiones_insert" on public.mm_caja_sesiones;
create policy "mm_caja_sesiones_insert" on public.mm_caja_sesiones for insert to authenticated
  with check (
    tenant_id in (select public.auth_tenant_ids())
    and sucursal_id in (select public.auth_sucursal_ids(tenant_id))
  );

drop policy if exists "mm_caja_sesiones_update" on public.mm_caja_sesiones;
create policy "mm_caja_sesiones_update" on public.mm_caja_sesiones for update to authenticated
  using (
    tenant_id in (select public.auth_tenant_ids())
    and sucursal_id in (select public.auth_sucursal_ids(tenant_id))
  )
  with check (
    tenant_id in (select public.auth_tenant_ids())
    and sucursal_id in (select public.auth_sucursal_ids(tenant_id))
  );

-- mm_caja_movimientos NO tiene sucursal_id propio -- se deriva de la sesion
-- padre. Helper security definer, mismo patron que mm_venta_sucursal_id (0113).
create or replace function public.mm_caja_sesion_sucursal_id(v_sesion_id uuid, v_tenant_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select sucursal_id
  from public.mm_caja_sesiones
  where id = v_sesion_id
    and tenant_id = v_tenant_id;
$$;

drop policy if exists "mm_caja_movimientos_select" on public.mm_caja_movimientos;
create policy "mm_caja_movimientos_select" on public.mm_caja_movimientos for select to authenticated
  using (
    tenant_id in (select public.auth_tenant_ids())
    and public.mm_caja_sesion_sucursal_id(sesion_id, tenant_id) in (select public.auth_sucursal_ids(tenant_id))
  );

drop policy if exists "mm_caja_movimientos_insert" on public.mm_caja_movimientos;
create policy "mm_caja_movimientos_insert" on public.mm_caja_movimientos for insert to authenticated
  with check (
    tenant_id in (select public.auth_tenant_ids())
    and public.mm_caja_sesion_sucursal_id(sesion_id, tenant_id) in (select public.auth_sucursal_ids(tenant_id))
  );
-- Sin update ni delete: ledger append-only, igual que antes de esta migracion.
