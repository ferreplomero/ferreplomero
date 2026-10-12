-- =============================================================================
-- 0121 - Descuento global del presupuesto (comentarios en ASCII plano a
-- proposito: ver 0032/0033/0035/0036, donde tildes/guiones largos se
-- corrompieron al copiar y pegar en el SQL Editor de Supabase).
--
-- El presupuesto puede llevar un descuento sobre el total, porcentual o en
-- monto fijo (USD). Se guarda:
--   descuento_tipo  -> 'ninguno' | 'porcentaje' | 'monto'
--   descuento_valor -> lo que escribio el usuario (10 = 10 % o $10)
--   descuento_usd   -> el monto resultante en USD, ya calculado y congelado
-- El IVA se calcula sobre (subtotal - descuento). Al convertir en venta, el
-- descuento viaja al POS igual que el descuento de una venta normal.
--
-- Presupuestos existentes quedan en 'ninguno'/0: sus totales no cambian.
-- =============================================================================

alter table public.mm_presupuestos
  add column if not exists descuento_tipo  text not null default 'ninguno',
  add column if not exists descuento_valor numeric(14, 2) not null default 0,
  add column if not exists descuento_usd   numeric(14, 2) not null default 0;

alter table public.mm_presupuestos
  drop constraint if exists mm_presupuestos_descuento_tipo_check;
alter table public.mm_presupuestos
  add constraint mm_presupuestos_descuento_tipo_check
  check (descuento_tipo in ('ninguno', 'porcentaje', 'monto'));

alter table public.mm_presupuestos
  drop constraint if exists mm_presupuestos_descuento_valores_check;
alter table public.mm_presupuestos
  add constraint mm_presupuestos_descuento_valores_check
  check (descuento_valor >= 0 and descuento_usd >= 0);

-- Registro en el historial de migraciones (para que pnpm db:migrate no
-- intente reaplicar esto despues).
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0121_mm_presupuestos_descuento.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
