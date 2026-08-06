-- =============================================================================
-- 0049 · Cashea como método de pago (mm_metodo_pago)
--
-- Cashea ("compra ahora, paga después", muy usada en Venezuela) se agrega como
-- un método de pago más: el comerciante NO procesa crédito ni cuotas — eso lo
-- gestiona la app de Cashea aparte. Este sistema solo REGISTRA cuánto se cobró
-- por esa vía, igual que registra pago móvil, transferencia, Zelle, etc.
--
-- Solo agrega el valor al enum — nada más en este archivo puede usar
-- 'cashea' como literal todavía (Postgres no permite usar un valor de enum
-- recién agregado en la MISMA transacción que lo agrega; el runner de
-- migraciones aplica cada archivo dentro de un solo `begin/commit`). El resto
-- del soporte (config de métodos de pago, selector del POS, recibo, reportes)
-- vive en la capa de aplicación y ya sabe leer cualquier método nuevo del
-- enum sin requerir más cambios de esquema.
-- =============================================================================

alter type public.mm_metodo_pago add value if not exists 'cashea';
