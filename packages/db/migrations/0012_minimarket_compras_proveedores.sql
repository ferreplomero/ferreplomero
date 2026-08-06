-- =============================================================================
-- 0012 · Compras y Proveedores (sección 6.5) — campos adicionales y vista resumen.
-- Idempotente.
-- =============================================================================

alter table public.mm_proveedores
  add column if not exists whatsapp text check (char_length(whatsapp) <= 30);

alter table public.mm_compras
  add column if not exists notas text check (char_length(notas) <= 1000);

create or replace view public.mm_v_resumen_proveedor as
select
  p.id                                                            as proveedor_id,
  p.tenant_id,
  count(c.id) filter (where c.estado = 'recibida')               as num_compras,
  coalesce(
    sum(c.total_usd) filter (where c.estado = 'recibida'), 0
  )                                                               as total_comprado_usd,
  max(c.fecha) filter (where c.estado = 'recibida')              as ultima_compra
from public.mm_proveedores p
left join public.mm_compras c
  on c.proveedor_id = p.id and c.deleted_at is null
group by p.id, p.tenant_id;
