-- =============================================================================
-- 0014 · Garantiza descuento_usd en mm_ventas y corrige security_invoker en
--        la vista mm_v_saldo_cliente.
--
-- Por qué:
--   - La migración 0013 añadió descuento_usd pero puede no haberse aplicado
--     todavía en producción. Esta migración lo hace idempotente.
--   - La migración 0011 recreó mm_v_saldo_cliente sin security_invoker = true,
--     lo que hacía que la vista usara permisos del propietario (bypass de RLS).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + DROP/CREATE VIEW.
-- =============================================================================

-- Asegura la columna de descuento global por venta.
ALTER TABLE public.mm_ventas
  ADD COLUMN IF NOT EXISTS descuento_usd DECIMAL(12, 2) NOT NULL DEFAULT 0;

-- Recrea la vista con security_invoker = true para que respete las políticas
-- RLS del usuario que consulta (mismo patrón que el resto de vistas del esquema).
DROP VIEW IF EXISTS public.mm_v_saldo_cliente;
CREATE VIEW public.mm_v_saldo_cliente
  WITH (security_invoker = true) AS
SELECT
  c.id                                                                        AS cliente_id,
  c.tenant_id,
  COALESCE(SUM(f.monto_usd) FILTER (
    WHERE f.estado <> 'anulado' AND f.deleted_at IS NULL
  ), 0)
  - COALESCE((
      SELECT SUM(a.monto_usd)
      FROM public.mm_abonos_fiado a
      WHERE a.cliente_id = c.id
    ), 0)                                                                     AS saldo_usd,
  MIN(f.created_at) FILTER (
    WHERE f.estado = 'abierto' AND f.deleted_at IS NULL
  )                                                                           AS primer_fiado_abierto_at
FROM public.mm_clientes c
LEFT JOIN public.mm_fiados f ON f.cliente_id = c.id
GROUP BY c.id, c.tenant_id;
