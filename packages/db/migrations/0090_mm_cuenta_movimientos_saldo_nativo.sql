-- =============================================================================
-- 0090 - Corrige el saldo de Bancos para que viva en la MONEDA NATIVA de cada
-- cuenta (Bs para pago_movil/transferencia/tarjeta/cashea, USD para Zelle) y
-- nunca se recalcule con la tasa del dia en que se consulta.
--
-- BUG que corrige: mm_v_saldo_cuenta_bancaria (0084) solo exponia saldo_usd
-- (suma de mm_cuenta_movimientos.monto_usd). La UI (bancos/page.tsx,
-- bancos/[id]/page.tsx, finanzas/page.tsx) mostraba el equivalente en Bs
-- multiplicando ese saldo_usd por la tasa VIGENTE AL MOMENTO DE VER LA
-- PAGINA -- no la tasa de cada movimiento. Resultado: una cuenta de pago
-- movil que recibio Bs 100.000 mostraba un monto distinto (mas alto) al
-- subir el dolar, aunque no entro ni salio un solo bolivar.
--
-- Los datos YA estan bien guardados: cada fila de mm_cuenta_movimientos
-- guarda monto_bs con el monto real en bolivares tal como se tecleo (ver
-- registrarMovimientoCuenta en ventas/actions.ts, sin cambios), congelado en
-- la fecha de ese movimiento. Nunca se ha reconvertido en la base -- el bug
-- era 100% de lectura. Por eso esta migracion NO hace backfill ni toca una
-- sola fila existente: solo agrega saldo_bs a la vista, sumando monto_bs con
-- el mismo criterio de signos que ya usa saldo_usd. saldo_usd se conserva
-- (Zelle lo sigue usando, es su moneda nativa).
-- =============================================================================

create or replace view public.mm_v_saldo_cuenta_bancaria
  with (security_invoker = true) as
select
  c.id as cuenta_id,
  c.tenant_id,
  coalesce(sum(
    case when m.tipo in ('venta', 'ingreso') then m.monto_usd
         when m.tipo in ('egreso', 'retiro') then -m.monto_usd
         else 0 end
  ), 0) as saldo_usd,
  coalesce(sum(
    case when m.tipo in ('venta', 'ingreso') then m.monto_bs
         when m.tipo in ('egreso', 'retiro') then -m.monto_bs
         else 0 end
  ), 0) as saldo_bs
from public.mm_cuentas_bancarias c
left join public.mm_cuenta_movimientos m
  on m.cuenta_id = c.id and m.tenant_id = c.tenant_id
where c.deleted_at is null
group by c.id, c.tenant_id;

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0090_mm_cuenta_movimientos_saldo_nativo.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
