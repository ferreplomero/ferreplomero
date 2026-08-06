-- =============================================================================
-- 0082 - Origen del dinero (metodo de pago) en gastos operativos, para poder
-- descontar la caja fisica cuando corresponde.
--
-- Contexto: mm_gastos_operativos (0047) nunca supo de donde salio el dinero
-- de un gasto -- ni siquiera un gasto pagado en efectivo descontaba la caja.
-- Esta migracion agrega una sola columna nueva, NULLABLE (no rompe filas
-- historicas), reutilizando el enum public.mm_metodo_pago que YA existe (el
-- mismo que usan mm_pagos_venta.metodo / mm_compras.metodo_pago /
-- mm_abonos_deuda.metodo) -- no se crea ningun catalogo nuevo.
--
-- La logica de negocio (si metodo_pago es efectivo_bs/efectivo_usd, insertar
-- un egreso en mm_caja_movimientos via el mismo mecanismo que ya usa el
-- modulo Caja, con `referencia` = mm_gastos_operativos.id -- igual patron que
-- ya usa Ventas para enlazar movimientos con venta.id) vive en TypeScript
-- (apps/web/app/(vertical)/minimarket/reportes/gastos/actions.ts), no en SQL:
-- no hay trigger. Se decide asi para poder bloquear la operacion completa con
-- un mensaje claro cuando no hay caja abierta o no hay tasa registrada, en
-- vez de fallar a mitad de una transaccion de base de datos.
-- =============================================================================

alter table public.mm_gastos_operativos
  add column if not exists metodo_pago public.mm_metodo_pago null;

comment on column public.mm_gastos_operativos.metodo_pago is
  'Origen del dinero del gasto. NULL = gasto historico registrado antes de esta '
  'funcionalidad, sin origen conocido. efectivo_bs/efectivo_usd generan un '
  'egreso en mm_caja_movimientos (referencia = este gasto); el resto de '
  'metodos solo quedan registrados aqui para control, sin tocar caja.';

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0082_mm_gastos_metodo_pago.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
