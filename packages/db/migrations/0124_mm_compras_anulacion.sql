-- =============================================================================
-- 0124 - Anulacion de compras recibidas (comentarios en ASCII plano a
-- proposito: ver 0032/0033/0035/0036, donde tildes/guiones largos se
-- corrompieron al copiar y pegar en el SQL Editor de Supabase).
--
-- Una compra recibida ya sumo stock, pudo cambiar costo/precio de productos y
-- saco dinero de Caja o Bancos. Para poder anularla (solo administradores) y
-- revertir todo eso se guarda:
--   costos_aplicados -> lo que esta compra cambio en cada producto:
--     [{ producto_id, costo_anterior, precio_anterior, costo_nuevo, precio_nuevo }]
--     null en compras viejas (registradas antes de esta migracion).
--   anulada_at / anulada_por -> auditoria de quien y cuando la anulo.
--
-- Compras existentes: nada cambia.
-- =============================================================================

alter table public.mm_compras
  add column if not exists costos_aplicados jsonb;

alter table public.mm_compras
  add column if not exists anulada_at timestamptz;

alter table public.mm_compras
  add column if not exists anulada_por uuid references public.profiles (id);
