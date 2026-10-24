-- =============================================================================
-- 0123 - Descuento por pago en divisas (comentarios en ASCII plano a
-- proposito: ver 0032/0033/0035/0036, donde tildes/guiones largos se
-- corrompieron al copiar y pegar en el SQL Editor de Supabase).
--
-- En el cobro del POS, si el cliente paga en efectivo USD, el cajero puede
-- darle un descuento (porcentual o monto fijo). Se guarda aparte SOLO para
-- poder mostrarlo en el recibo y en el detalle de la venta:
--   descuento_divisas_usd -> parte de descuento_usd que es por pago en divisas
-- descuento_usd sigue siendo el descuento TOTAL de la venta (carrito +
-- divisas): todos los totales, IVA, IGTF y reportes se siguen calculando
-- igual que antes a partir de el.
--
-- Ventas existentes quedan en 0: nada cambia.
-- =============================================================================

alter table public.mm_ventas
  add column if not exists descuento_divisas_usd numeric(14, 2) not null default 0;

alter table public.mm_ventas
  drop constraint if exists mm_ventas_descuento_divisas_check;
alter table public.mm_ventas
  add constraint mm_ventas_descuento_divisas_check
  check (descuento_divisas_usd >= 0 and descuento_divisas_usd <= descuento_usd);
