-- =============================================================================
-- 0105 - Conecta la SALIDA de dinero de una compra con Caja/Bancos.
--
-- Contexto: mm_compras.metodo_pago (0042) ya sabia como se le pago al
-- proveedor, pero solo se usaba para el IGTF de control interno (Finanzas) --
-- nunca generaba un egreso real en mm_caja_movimientos ni en
-- mm_cuenta_movimientos (a diferencia de mm_gastos_operativos, que ya se
-- conecto en 0100). Esta migracion agrega:
--
--   cuenta_bancaria_id -> de cual cuenta bancaria salio el dinero, solo
--                         cuando metodo_pago es digital (pago_movil/
--                         transferencia/zelle/tarjeta) -- mismo patron que
--                         mm_gastos_operativos.cuenta_bancaria_id (0100).
--   pagada             -> false SOLO para una compra 'credito_proveedor'
--                         (recibida pero aun no pagada de verdad -- cuenta
--                         por pagar real, distinta del estado 'borrador' que
--                         solo indica mercancia pendiente de recibir).
--                         default TRUE: las compras existentes y las
--                         creadas con cualquier metodo real ya se consideran
--                         resueltas (no hay forma de generar retroactivamente
--                         el egreso que nunca se registro).
--   fecha_pago         -> cuando se registro el pago real (inmediato para
--                         cualquier metodo real, o mas tarde via pagarCompra
--                         cuando una compra 'credito_proveedor' se paga).
--
-- La logica de negocio (decidir Caja vs Bancos, insertar el egreso via
-- insertarMovimientoCaja/insertarMovimientoCuenta con `referencia` =
-- mm_compras.id, revertirlo si se anula la compra) vive en TypeScript
-- (apps/web/app/(vertical)/minimarket/compras/actions.ts), no en SQL --
-- mismo criterio que 0100.
-- =============================================================================

alter table public.mm_compras
  add column if not exists cuenta_bancaria_id uuid null
    references public.mm_cuentas_bancarias (id) on delete set null;

alter table public.mm_compras
  add column if not exists pagada boolean not null default true;

alter table public.mm_compras
  add column if not exists fecha_pago timestamptz null;

comment on column public.mm_compras.cuenta_bancaria_id is
  'Cuenta bancaria de la que salio (o saldra) el dinero, solo cuando '
  'metodo_pago es digital. NULL para efectivo (descuenta Caja) y para '
  'compras a credito_proveedor aun no pagadas.';

comment on column public.mm_compras.pagada is
  'false SOLO mientras una compra metodo_pago=credito_proveedor no ha sido '
  'pagada de verdad (cuenta por pagar real). true para cualquier otro '
  'metodo (el pago ya se registro al recibirse) y para compras historicas.';

comment on column public.mm_compras.fecha_pago is
  'Momento en que el dinero realmente salio del negocio -- inmediato al '
  'registrar la compra, o el momento de pagarCompra() para una compra que '
  'empezo como credito_proveedor.';

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0105_mm_compras_pago.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
