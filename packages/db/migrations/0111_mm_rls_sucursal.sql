-- =============================================================================
-- 0111 · Aislamiento por sucursal en RLS (stock)
--
-- Hasta ahora el unico aislamiento real en la base de datos era por tenant_id
-- (0007_minimarket_rls.sql): cualquier usuario autenticado del tenant podia
-- leer/escribir el stock de CUALQUIER sucursal, sin importar a cuales tenia
-- acceso via mm_usuarios_sucursal. Esta migracion agrega el filtro de
-- sucursal a las dos tablas donde vive el stock (mm_inventario,
-- mm_movimientos_inventario) - mm_v_stock lo hereda gratis por ser una vista
-- security_invoker sobre mm_movimientos_inventario.
--
-- mm_productos NO se toca: es catalogo compartido por tenant (sin
-- sucursal_id), filtrarlo rompería el modelo. mm_sucursales/
-- mm_usuarios_sucursal tampoco: su RLS de lectura por tenant no es el
-- problema de esta fase (que sucursales puede ELEGIR el usuario se resuelve
-- en la capa de aplicacion, con la misma funcion de abajo).
-- =============================================================================

-- Sucursales del usuario autenticado dentro de un tenant. Dueno/administrador
-- (roles de sistema con permiso total) ven TODAS las sucursales del tenant
-- sin necesitar una fila por cada una -- evita tener que reasignarlos a mano
-- cada vez que se crea una sucursal nueva. Sin ninguna fila propia y sin ese
-- rol -> conjunto vacio (a proposito: a diferencia del permiso de modulo,
-- aqui "sin asignacion" nunca debe significar "sin restriccion", porque el
-- costo de fallar abierto es fuga real de stock ajeno).
create or replace function public.auth_sucursal_ids(target_tenant uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from public.mm_sucursales s
  where s.tenant_id = target_tenant
    and s.deleted_at is null
    and exists (
      select 1
      from public.mm_usuarios_sucursal u
      join public.mm_roles r on r.id = u.rol_id
      where u.tenant_id = target_tenant
        and u.profile_id = auth.uid()
        and u.activo
        and u.deleted_at is null
        and r.slug in ('dueno', 'administrador')
    )
  union
  select u.sucursal_id
  from public.mm_usuarios_sucursal u
  where u.tenant_id = target_tenant
    and u.profile_id = auth.uid()
    and u.activo
    and u.deleted_at is null;
$$;

-- mm_inventario (tabla operativa mutable: select/insert/update) -----------------
drop policy if exists "mm_inventario_select" on public.mm_inventario;
create policy "mm_inventario_select" on public.mm_inventario for select to authenticated
  using (
    tenant_id in (select public.auth_tenant_ids())
    and sucursal_id in (select public.auth_sucursal_ids(tenant_id))
  );

drop policy if exists "mm_inventario_insert" on public.mm_inventario;
create policy "mm_inventario_insert" on public.mm_inventario for insert to authenticated
  with check (
    tenant_id in (select public.auth_tenant_ids())
    and sucursal_id in (select public.auth_sucursal_ids(tenant_id))
  );

drop policy if exists "mm_inventario_update" on public.mm_inventario;
create policy "mm_inventario_update" on public.mm_inventario for update to authenticated
  using (
    tenant_id in (select public.auth_tenant_ids())
    and sucursal_id in (select public.auth_sucursal_ids(tenant_id))
  )
  with check (
    tenant_id in (select public.auth_tenant_ids())
    and sucursal_id in (select public.auth_sucursal_ids(tenant_id))
  );

-- mm_movimientos_inventario (ledger append-only: select + insert) ---------------
drop policy if exists "mm_movimientos_inventario_select" on public.mm_movimientos_inventario;
create policy "mm_movimientos_inventario_select" on public.mm_movimientos_inventario for select to authenticated
  using (
    tenant_id in (select public.auth_tenant_ids())
    and sucursal_id in (select public.auth_sucursal_ids(tenant_id))
  );

drop policy if exists "mm_movimientos_inventario_insert" on public.mm_movimientos_inventario;
create policy "mm_movimientos_inventario_insert" on public.mm_movimientos_inventario for insert to authenticated
  with check (
    tenant_id in (select public.auth_tenant_ids())
    and sucursal_id in (select public.auth_sucursal_ids(tenant_id))
  );
