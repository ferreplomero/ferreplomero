-- =============================================================================
-- 0030 · Índices de rendimiento — stock y saldo de cliente
--
-- Dos vistas del vertical minimarket agregan sobre ledgers append-only en
-- CADA lectura (nunca sobre un contador editable — CLAUDE.md, regla de
-- offline-first): se vuelven más lentas a medida que crece el historial real
-- de uso (ventas, compras, ajustes, abonos), no por falta de datos de
-- prueba. Estos índices no cambian ningún resultado, solo cómo Postgres los
-- calcula.
--
-- 1) mm_v_stock (packages/db/migrations/0006) sirve el stock de CADA
--    producto en cada carga del POS y del Inventario (`listProductos`).
--    Ya existía un índice sobre (tenant_id, producto_id, sucursal_id), pero
--    Postgres igual debía ir al heap a leer `cantidad` para sumarla. Se
--    reemplaza por un índice de cobertura (INCLUDE cantidad): la agregación
--    se resuelve entera desde el índice (index-only scan).
--
-- 2) mm_v_saldo_cliente (packages/db/migrations/0014) hace, POR CADA
--    cliente, una subconsulta correlacionada sobre mm_abonos_fiado filtrada
--    por cliente_id — columna que no tenía ningún índice, así que cada
--    subconsulta escaneaba la tabla completa. Se usa en cada venta fiada
--    (validación del límite de crédito) y en cada carga de Clientes/POS
--    (`listClientes`). Nuevo índice por (tenant_id, cliente_id).
-- =============================================================================

drop index if exists public.mm_mov_inv_stock_idx;
create index if not exists mm_mov_inv_stock_idx
  on public.mm_movimientos_inventario (tenant_id, producto_id, sucursal_id)
  include (cantidad);

create index if not exists mm_abonos_fiado_cliente_idx
  on public.mm_abonos_fiado (tenant_id, cliente_id);
