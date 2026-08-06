-- =============================================================================
-- 0092 - Devolucion de dinero al anular una venta.
--
-- Encabezado append-only (mismo patron que mm_creditos_cliente/0087 y
-- mm_gastos_operativos): registra QUE se devolvio dinero por la anulacion de
-- una venta, por que metodo/cuenta y cuanto. El egreso REAL en caja o banco
-- sigue viviendo en mm_caja_movimientos/mm_cuenta_movimientos (mismo
-- mecanismo ya usado por ventas/gastos/abonos), insertado con
-- referencia = mm_devoluciones_venta.id -- NUNCA con referencia = venta.id,
-- a proposito:
--
-- getExcedenteVenta (apps/web/lib/minimarket/data/ventas.ts) ya asume, con
-- .maybeSingle(), que existe A LO SUMO una fila tipo='egreso' con
-- referencia = venta.id en esos dos ledgers (el vuelto entregado en el
-- momento de la venta). Si el egreso de la devolucion usara esa misma
-- referencia, esa consulta rompe (mas de una fila) para cualquier venta que
-- haya tenido vuelto Y despues se anule. Con este id propio como referencia,
-- getExcedenteVenta queda completamente intacto.
--
-- No se toca mm_ventas ni su enum de estado (completada/anulada, 0005): la
-- devolucion es informacion ADICIONAL sobre una venta ya anulada, no un
-- estado nuevo.
-- =============================================================================

create table if not exists public.mm_devoluciones_venta (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  venta_id           uuid not null references public.mm_ventas (id) on delete cascade,
  usuario_id         uuid references public.profiles (id) on delete set null,
  metodo             public.mm_metodo_pago not null,
  cuenta_bancaria_id uuid references public.mm_cuentas_bancarias (id) on delete set null,
  monto_usd          numeric(14, 2) not null check (monto_usd >= 0),
  monto_bs           numeric(16, 2) not null default 0,
  tasa_usada         numeric(18, 6),
  motivo             text not null,
  created_at         timestamptz not null default now()
);
create index if not exists mm_devoluciones_venta_idx
  on public.mm_devoluciones_venta (tenant_id, venta_id);

-- --- RLS: ledger append-only (solo select + insert, inmutable) ------------------
alter table public.mm_devoluciones_venta enable row level security;

drop policy if exists "mm_devoluciones_venta_select" on public.mm_devoluciones_venta;
create policy "mm_devoluciones_venta_select" on public.mm_devoluciones_venta for select to authenticated
  using (tenant_id in (select public.auth_tenant_ids()));

drop policy if exists "mm_devoluciones_venta_insert" on public.mm_devoluciones_venta;
create policy "mm_devoluciones_venta_insert" on public.mm_devoluciones_venta for insert to authenticated
  with check (tenant_id in (select public.auth_tenant_ids()));

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0092_mm_devoluciones_venta.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
