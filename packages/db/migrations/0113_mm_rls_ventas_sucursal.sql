-- =============================================================================
-- 0113 · Aislamiento por sucursal en RLS (ventas)
--
-- La migracion 0111 protegio el stock (mm_inventario, mm_movimientos_inventario)
-- pero nunca toco mm_ventas ni mm_ventas_items. Hasta ahora, lo unico que
-- impedia que un cajero registrara una venta en una sucursal ajena era la
-- validacion de aplicacion en `registrarVenta` (ventas/actions.ts) -- nunca
-- una barrera de base de datos.
--
-- Confirmado con una prueba en vivo (Fase 2, POS por sucursal): con la sesion
-- real de un cajero de una sola sucursal, un INSERT directo contra PostgREST
-- (saltandose la UI y el server action) en mm_ventas con sucursal_id ajeno se
-- aceptaba igual (HTTP 201) -- lo mismo con mm_ventas_items. El movimiento de
-- stock correspondiente si fallaba (RLS de 0111 lo bloquea, HTTP 403), pero
-- la venta fantasma quedaba escrita, contaminando historial/reportes de una
-- sucursal ajena.
--
-- Esta migracion cierra ese hueco extendiendo el MISMO patron de 0111/0112 a
-- mm_ventas y mm_ventas_items -- misma funcion auth_sucursal_ids() (ya
-- corregida por 0112 para que dueño/administrador operen en todas las
-- sucursales del tenant).
--
-- Fuera de alcance a proposito (mismo criterio que 0111 con mm_productos):
-- mm_pagos_venta y mm_fiados no se tocan aqui. mm_fiados es deliberadamente
-- COMPARTIDO (el fiado sigue al cliente, no a la sucursal - ver CLAUDE.md).
-- mm_pagos_venta tiene el mismo hueco teorico que mm_ventas_items, pero
-- queda fuera de esta migracion puntual; se puede cerrar en una migracion
-- aparte con el mismo helper de abajo si hace falta.
-- =============================================================================

-- mm_ventas SI tiene sucursal_id propio: mismo patron exacto que mm_inventario
-- en 0111 (select/insert/update, tabla operativa mutable).
drop policy if exists "mm_ventas_select" on public.mm_ventas;
create policy "mm_ventas_select" on public.mm_ventas for select to authenticated
  using (
    tenant_id in (select public.auth_tenant_ids())
    and sucursal_id in (select public.auth_sucursal_ids(tenant_id))
  );

drop policy if exists "mm_ventas_insert" on public.mm_ventas;
create policy "mm_ventas_insert" on public.mm_ventas for insert to authenticated
  with check (
    tenant_id in (select public.auth_tenant_ids())
    and sucursal_id in (select public.auth_sucursal_ids(tenant_id))
  );

drop policy if exists "mm_ventas_update" on public.mm_ventas;
create policy "mm_ventas_update" on public.mm_ventas for update to authenticated
  using (
    tenant_id in (select public.auth_tenant_ids())
    and sucursal_id in (select public.auth_sucursal_ids(tenant_id))
  )
  with check (
    tenant_id in (select public.auth_tenant_ids())
    and sucursal_id in (select public.auth_sucursal_ids(tenant_id))
  );

-- mm_ventas_items NO tiene sucursal_id propio -- se deriva de la venta padre.
-- Helper security definer (mismo motivo que auth_sucursal_ids: evita que la
-- subconsulta dispare de nuevo la RLS de mm_ventas dentro de esta misma
-- politica, y deja la logica en un solo lugar reutilizable para cualquier
-- otra tabla hija de mm_ventas que la necesite despues, ej. mm_pagos_venta).
create or replace function public.mm_venta_sucursal_id(v_venta_id uuid, v_tenant_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select sucursal_id
  from public.mm_ventas
  where id = v_venta_id
    and tenant_id = v_tenant_id;
$$;

drop policy if exists "mm_ventas_items_select" on public.mm_ventas_items;
create policy "mm_ventas_items_select" on public.mm_ventas_items for select to authenticated
  using (
    tenant_id in (select public.auth_tenant_ids())
    and public.mm_venta_sucursal_id(venta_id, tenant_id) in (select public.auth_sucursal_ids(tenant_id))
  );

drop policy if exists "mm_ventas_items_insert" on public.mm_ventas_items;
create policy "mm_ventas_items_insert" on public.mm_ventas_items for insert to authenticated
  with check (
    tenant_id in (select public.auth_tenant_ids())
    and public.mm_venta_sucursal_id(venta_id, tenant_id) in (select public.auth_sucursal_ids(tenant_id))
  );

drop policy if exists "mm_ventas_items_update" on public.mm_ventas_items;
create policy "mm_ventas_items_update" on public.mm_ventas_items for update to authenticated
  using (
    tenant_id in (select public.auth_tenant_ids())
    and public.mm_venta_sucursal_id(venta_id, tenant_id) in (select public.auth_sucursal_ids(tenant_id))
  )
  with check (
    tenant_id in (select public.auth_tenant_ids())
    and public.mm_venta_sucursal_id(venta_id, tenant_id) in (select public.auth_sucursal_ids(tenant_id))
  );
