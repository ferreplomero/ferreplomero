-- =============================================================================
-- 0100 - Cuenta bancaria de un gasto operativo pagado por metodo digital.
--
-- Contexto: mm_gastos_operativos (0047) + metodo_pago (0082) ya sabian de
-- donde salia el dinero de un gasto, pero solo el lado efectivo generaba un
-- egreso real (en mm_caja_movimientos). Para pago_movil/transferencia/zelle/
-- tarjeta no habia ninguna columna para saber DE CUAL cuenta bancaria salio
-- el dinero -- el gasto quedaba registrado "para control" sin descontar
-- ningun saldo real (ver comentario original en 0082). Esta migracion agrega
-- una sola columna NULLABLE (no rompe filas historicas ni gastos en
-- efectivo, que nunca la usan) para que el gasto digital pueda enlazarse con
-- su cuenta en mm_cuentas_bancarias, igual patron que mm_pagos_venta.
-- cuenta_bancaria_id (0085).
--
-- La logica de negocio (insertar el egreso en mm_cuenta_movimientos via
-- insertarMovimientoCuenta, con `referencia` = mm_gastos_operativos.id, igual
-- mecanismo que ya usa Ventas) vive en TypeScript
-- (apps/web/app/(vertical)/minimarket/reportes/gastos/actions.ts), no en SQL.
-- =============================================================================

alter table public.mm_gastos_operativos
  add column if not exists cuenta_bancaria_id uuid null
    references public.mm_cuentas_bancarias (id) on delete set null;

comment on column public.mm_gastos_operativos.cuenta_bancaria_id is
  'Cuenta bancaria de la que salio el dinero, solo cuando metodo_pago es '
  'digital (pago_movil/transferencia/zelle/tarjeta). NULL para gastos en '
  'efectivo (que descuentan Caja, no Bancos) y para gastos historicos '
  'anteriores a esta migracion.';

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0100_mm_gastos_cuenta_bancaria.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
