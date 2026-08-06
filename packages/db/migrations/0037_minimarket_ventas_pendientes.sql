-- =============================================================================
-- 0037 - Ventas en espera / borrador del POS minimarket (comentarios en ASCII
-- plano a proposito: ver 0032/0033/0035/0036, donde tildes/guiones largos se
-- corrompieron al copiar y pegar en el SQL Editor de Supabase y rompieron el
-- parser).
--
-- Caso de uso: el cajero esta armando un cobro (carrito + cliente + pagos ya
-- tecleados) y necesita atender otra venta o se le va la luz/se recarga la
-- pagina SIN haber cobrado. Esa venta en curso NO debe perderse: se guarda
-- como fila "pendiente" en esta tabla (carrito/pagos serializados en JSON, ya
-- que es un borrador, no una transaccion estructurada) y el POS la retoma tal
-- cual quedo.
--
-- Deliberadamente es una tabla SEPARADA de mm_ventas: una venta pendiente NO
-- es una venta (no descuenta inventario, no mueve caja, no aparece en
-- Historial/Finanzas/Reportes). Solo se vuelve una venta real cuando el
-- cajero confirma el cobro (se borra esta fila y se crea la fila en
-- mm_ventas por el camino normal); o desaparece si el cajero la cancela.
--
-- Es efimera por naturaleza: a diferencia del resto de las tablas mm_* que
-- usan borrado logico (deleted_at), aqui se permite DELETE fisico (cancelar
-- o confirmar la borran de verdad) - mismo patron ya usado en
-- mm_producto_codigos (ver 0010_minimarket_inventario_detalle.sql).
-- =============================================================================

create table if not exists public.mm_ventas_pendientes (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  sucursal_id      uuid not null references public.mm_sucursales (id) on delete cascade,
  usuario_id       uuid references public.profiles (id) on delete set null,
  cliente_id       uuid references public.mm_clientes (id) on delete set null,
  -- Etiqueta libre para identificar la venta ("Mesa 2", "el senor de la gorra").
  nota             text,
  -- Carrito y pagos tal como estaban en el POS: [{productoId, cantidad}] /
  -- [{metodo, monto, autoSaldo}]. Es un borrador, no una transaccion
  -- estructurada -- se valida con Zod en la app al leerlo, no aqui.
  carrito_json     jsonb not null default '[]'::jsonb,
  pagos_json       jsonb not null default '[]'::jsonb,
  descuento_pct    text not null default '',
  descuento_monto  text not null default '',
  tasa_tipo        text not null default 'bcv' check (tasa_tipo in ('bcv', 'euro', 'manual')),
  -- Denormalizado solo para pintar el listado de pendientes sin recalcular.
  subtotal_usd     numeric(14, 2) not null default 0,
  articulos_count  numeric(14, 3) not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists mm_ventas_pendientes_sucursal_idx
  on public.mm_ventas_pendientes (tenant_id, sucursal_id, updated_at desc);

-- RLS: select/insert/update/delete por pertenencia al tenant (delete fisico
-- permitido a proposito: cancelar o confirmar una pendiente la elimina).
alter table public.mm_ventas_pendientes enable row level security;

drop policy if exists "mm_ventas_pendientes_select" on public.mm_ventas_pendientes;
create policy "mm_ventas_pendientes_select" on public.mm_ventas_pendientes for select to authenticated
  using (tenant_id in (select public.auth_tenant_ids()));

drop policy if exists "mm_ventas_pendientes_insert" on public.mm_ventas_pendientes;
create policy "mm_ventas_pendientes_insert" on public.mm_ventas_pendientes for insert to authenticated
  with check (tenant_id in (select public.auth_tenant_ids()));

drop policy if exists "mm_ventas_pendientes_update" on public.mm_ventas_pendientes;
create policy "mm_ventas_pendientes_update" on public.mm_ventas_pendientes for update to authenticated
  using (tenant_id in (select public.auth_tenant_ids()))
  with check (tenant_id in (select public.auth_tenant_ids()));

drop policy if exists "mm_ventas_pendientes_delete" on public.mm_ventas_pendientes;
create policy "mm_ventas_pendientes_delete" on public.mm_ventas_pendientes for delete to authenticated
  using (tenant_id in (select public.auth_tenant_ids()));

-- Registro en el historial de migraciones (para que pnpm db:migrate no
-- intente reaplicar esto despues).
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0037_minimarket_ventas_pendientes.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
