-- =============================================================================
-- 0085 - A que cuenta bancaria entro un pago digital de una venta.
--
-- Columna aditiva y NULLABLE en mm_pagos_venta -- no rompe filas historicas ni
-- las de metodos que nunca tienen cuenta (efectivo, zelle, fiado, cashea).
-- Solo se llena cuando el metodo es pago_movil/transferencia/tarjeta Y el
-- negocio ya tiene esa cuenta configurada (0083) -- si no, la venta se sigue
-- procesando igual que antes de esta migracion, simplemente sin cuenta
-- asignada (mismo criterio que mm_gastos_operativos.metodo_pago en 0082).
-- =============================================================================

alter table public.mm_pagos_venta
  add column if not exists cuenta_bancaria_id uuid null
    references public.mm_cuentas_bancarias (id) on delete set null;

create index if not exists mm_pagos_venta_cuenta_idx
  on public.mm_pagos_venta (cuenta_bancaria_id) where cuenta_bancaria_id is not null;

comment on column public.mm_pagos_venta.cuenta_bancaria_id is
  'Cuenta bancaria del negocio que recibio este pago (solo pago_movil/transferencia/'
  'tarjeta). NULL = efectivo/zelle/fiado/cashea, o un pago digital sin cuenta '
  'asignada (historico anterior a esta funcionalidad, o negocio sin cuentas configuradas).';

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0085_mm_pagos_venta_cuenta_bancaria.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
