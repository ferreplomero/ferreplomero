-- =============================================================================
-- 0042 - IVA, IGTF y metodo de pago en compras (control interno, Finanzas)
-- (comentarios en ASCII plano, ver 0032/0036: tildes rompen el parser al
-- copiar y pegar en el SQL Editor de Supabase).
--
-- Hasta ahora mm_compras.total_usd es SOLO el costo de la mercancia (sin
-- impuestos) -- no hay forma de saber cuanto IVA se pago al proveedor ni
-- cuanto IGTF causo pagarle en divisa. Se agregan:
--   iva_usd     -> IVA pagado en esta compra (iva_pct de mm_config_negocio
--                  sobre total_usd, solo si iva_activo). Calculado y
--                  congelado al registrar la compra, igual que mm_ventas.
--   igtf_usd    -> IGTF (3%) sobre (total_usd + iva_usd) SOLO si metodo_pago
--                  es efectivo_usd o zelle e igtf_activo (mismo criterio que
--                  causaIgtf() en ventas).
--   metodo_pago -> como se le pago al proveedor (mismo enum que ventas,
--                  mm_metodo_pago). Nullable: las compras existentes no lo
--                  tienen y no hay forma de saberlo retroactivamente.
--
-- total_usd NO cambia de significado (sigue siendo el costo puro de
-- mercancia: lo usan la valorizacion de inventario, las estadisticas de
-- proveedor y "cuentas por pagar"). El total realmente pagado/adeudado al
-- proveedor (costo + IVA) y el costo adicional de IGTF se calculan aparte,
-- en el modulo Finanzas.
-- =============================================================================

alter table public.mm_compras add column if not exists iva_usd numeric(14, 2) not null default 0;
alter table public.mm_compras add column if not exists igtf_usd numeric(14, 2) not null default 0;
alter table public.mm_compras add column if not exists metodo_pago public.mm_metodo_pago;

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0042_mm_compras_iva_igtf.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
