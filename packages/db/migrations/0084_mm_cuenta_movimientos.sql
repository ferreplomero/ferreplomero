-- =============================================================================
-- 0084 - Ledger append-only de movimientos de las cuentas bancarias (0083).
-- Mismo patron que mm_caja_movimientos: el saldo de una cuenta NUNCA es un
-- contador editable, siempre se deriva de este ledger via la vista
-- mm_v_saldo_cuenta_bancaria (mismo criterio que mm_v_saldo_cliente/mm_v_saldo_deuda).
--
-- Reutiliza el enum public.mm_caja_mov_tipo que YA existe (mismos 4 valores y
-- mismo significado que usa Caja: 'venta'/'ingreso' suman, 'egreso'/'retiro'
-- restan) -- no se crea un catalogo nuevo para esto, igual criterio que 0082.
-- =============================================================================

create table if not exists public.mm_cuenta_movimientos (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  cuenta_id   uuid not null references public.mm_cuentas_bancarias (id) on delete cascade,
  tipo        public.mm_caja_mov_tipo not null,
  monto_usd   numeric(14, 2) not null check (monto_usd >= 0),
  monto_bs    numeric(16, 2) not null default 0,
  tasa_usada  numeric(18, 6),
  motivo      text,
  referencia  uuid,
  usuario_id  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists mm_cuenta_movimientos_idx
  on public.mm_cuenta_movimientos (tenant_id, cuenta_id, created_at desc);

-- Saldo por cuenta: derivado, nunca editable directamente (mismo criterio que
-- mm_v_saldo_cliente/mm_v_saldo_deuda). Puede quedar negativo (ej. un vuelto o
-- retiro mayor al saldo conocido) -- se muestra en la UI como aviso, nunca
-- bloquea la operacion que lo origino.
create or replace view public.mm_v_saldo_cuenta_bancaria
  with (security_invoker = true) as
select
  c.id as cuenta_id,
  c.tenant_id,
  coalesce(sum(
    case when m.tipo in ('venta', 'ingreso') then m.monto_usd
         when m.tipo in ('egreso', 'retiro') then -m.monto_usd
         else 0 end
  ), 0) as saldo_usd
from public.mm_cuentas_bancarias c
left join public.mm_cuenta_movimientos m
  on m.cuenta_id = c.id and m.tenant_id = c.tenant_id
where c.deleted_at is null
group by c.id, c.tenant_id;

-- --- RLS: ledger append-only (solo select + insert, inmutable) ------------------
alter table public.mm_cuenta_movimientos enable row level security;

drop policy if exists "mm_cuenta_movimientos_select" on public.mm_cuenta_movimientos;
create policy "mm_cuenta_movimientos_select" on public.mm_cuenta_movimientos for select to authenticated
  using (tenant_id in (select public.auth_tenant_ids()));

drop policy if exists "mm_cuenta_movimientos_insert" on public.mm_cuenta_movimientos;
create policy "mm_cuenta_movimientos_insert" on public.mm_cuenta_movimientos for insert to authenticated
  with check (tenant_id in (select public.auth_tenant_ids()));

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0084_mm_cuenta_movimientos.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
