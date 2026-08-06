-- =============================================================================
-- 0087 - Saldo a favor del cliente (excedente acreditado en una venta).
--
-- Ledger append-only, mismo patron exacto que mm_cuenta_movimientos (0084):
-- el saldo NUNCA es un contador editable, siempre se deriva de este ledger
-- via la vista mm_v_saldo_credito_cliente.
--
-- Separado por completo de mm_fiados/mm_abonos_fiado a proposito: fiado es
-- deuda del cliente hacia el negocio; esto es la relacion inversa (el negocio
-- le debe al cliente un excedente que pago de mas). Mezclarlos en la misma
-- tabla obligaria a permitir montos negativos en mm_fiados y tocaria el
-- calculo de moroso/limite de credito que ya funciona -- se evita del todo.
--
-- tipo: 'otorgado' (el negocio le debe al cliente, ej. excedente acreditado
-- en una venta) | 'usado' (el cliente lo aplico como pago en una venta
-- posterior, metodo credito_cliente en mm_pagos_venta).
-- =============================================================================

do $$ begin
  create type public.mm_credito_cliente_tipo as enum ('otorgado', 'usado');
exception when duplicate_object then null; end $$;

create table if not exists public.mm_creditos_cliente (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  cliente_id  uuid not null references public.mm_clientes (id) on delete cascade,
  tipo        public.mm_credito_cliente_tipo not null,
  monto_usd   numeric(14, 2) not null check (monto_usd > 0),
  monto_bs    numeric(16, 2) not null default 0,
  tasa_usada  numeric(18, 6),
  -- venta.id que otorgo el credito (excedente acreditado) o que lo consumio
  -- (pago con metodo credito_cliente) -- mismo patron que mm_caja_movimientos.referencia.
  referencia  uuid,
  motivo      text,
  usuario_id  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists mm_creditos_cliente_idx
  on public.mm_creditos_cliente (tenant_id, cliente_id, created_at desc);

-- Saldo a favor por cliente: derivado, nunca editable directamente. Nunca
-- deberia quedar negativo (el consumo se valida contra el saldo disponible
-- antes de insertar el 'usado'), pero no se fuerza con un CHECK a nivel de
-- vista -- la validacion vive en el servidor (ventas/actions.ts), igual
-- criterio que el limite de fiado.
create or replace view public.mm_v_saldo_credito_cliente
  with (security_invoker = true) as
select
  c.id as cliente_id,
  c.tenant_id,
  coalesce(sum(
    case when m.tipo = 'otorgado' then m.monto_usd
         when m.tipo = 'usado' then -m.monto_usd
         else 0 end
  ), 0) as saldo_usd
from public.mm_clientes c
left join public.mm_creditos_cliente m
  on m.cliente_id = c.id and m.tenant_id = c.tenant_id
where c.deleted_at is null
group by c.id, c.tenant_id;

-- --- RLS: ledger append-only (solo select + insert, inmutable) ------------------
alter table public.mm_creditos_cliente enable row level security;

drop policy if exists "mm_creditos_cliente_select" on public.mm_creditos_cliente;
create policy "mm_creditos_cliente_select" on public.mm_creditos_cliente for select to authenticated
  using (tenant_id in (select public.auth_tenant_ids()));

drop policy if exists "mm_creditos_cliente_insert" on public.mm_creditos_cliente;
create policy "mm_creditos_cliente_insert" on public.mm_creditos_cliente for insert to authenticated
  with check (tenant_id in (select public.auth_tenant_ids()));

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0087_mm_creditos_cliente.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
