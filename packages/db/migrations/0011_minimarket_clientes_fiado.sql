-- =============================================================================
-- 0011 · Clientes y Fiado (sección 6.4) — ficha completa, estado de cuenta
-- derivado de ledger, abonos con IGTF, Zelle como método y vista actualizada.
-- Idempotente.
-- =============================================================================

alter type public.mm_metodo_pago add value if not exists 'zelle';

alter table public.mm_clientes
  add column if not exists cedula    text check (char_length(cedula) <= 20),
  add column if not exists direccion text check (char_length(direccion) <= 320);

alter table public.mm_abonos_fiado
  add column if not exists igtf_usd numeric(14, 4) not null default 0;

drop view if exists public.mm_v_saldo_cliente;
create view public.mm_v_saldo_cliente as
select
  c.id                                                                        as cliente_id,
  c.tenant_id,
  coalesce(sum(f.monto_usd) filter (
    where f.estado <> 'anulado' and f.deleted_at is null
  ), 0)
  - coalesce((
      select sum(a.monto_usd)
      from public.mm_abonos_fiado a
      where a.cliente_id = c.id
    ), 0)                                                                      as saldo_usd,
  min(f.created_at) filter (
    where f.estado = 'abierto' and f.deleted_at is null
  )                                                                            as primer_fiado_abierto_at
from public.mm_clientes c
left join public.mm_fiados f on f.cliente_id = c.id
group by c.id, c.tenant_id;
