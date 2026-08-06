-- =============================================================================
-- 0091 - Cashea se suma a mm_cuentas_bancarias (0083) como un metodo mas, para
-- que el negocio registre el/los banco(s) donde Cashea le deposita el dinero
-- de sus ventas -- mismo mecanismo que ya usan pago_movil/transferencia/
-- tarjeta/zelle (saldo derivado, historial, cuenta predeterminada), sin
-- inventar nada nuevo.
--
-- Cashea se identifica por banco/titular/cuenta, igual que transferencia --
-- no necesita una columna nueva (a diferencia de Zelle, que se identifica por
-- correo, ver 0089). No hay datos planos previos que migrar: METODO_CAMPOS
-- (metodos-pago.ts) nunca tuvo campos de banco para Cashea, asi que esta es
-- una funcionalidad nueva, no una migracion de datos existentes.
--
-- Cashea NUNCA causa IGTF (METODOS_DIVISA en constants.ts no lo incluye, no
-- se toca) y su moneda nativa es el bolivar (ver monedaNativaCuenta en
-- bancos.ts, migracion de codigo asociada a 0090) -- el ingreso que genere
-- una venta con Cashea se registra en mm_cuenta_movimientos en Bs, con el
-- mismo criterio de "moneda nativa fija" que corrige 0090 para todo Bancos.
-- =============================================================================

-- --- Ampliar el CHECK de metodo para aceptar 'cashea' --------------------------
do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'public.mm_cuentas_bancarias'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%pago_movil%'
  loop
    execute format('alter table public.mm_cuentas_bancarias drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.mm_cuentas_bancarias
  add constraint mm_cuentas_bancarias_metodo_check
    check (metodo in ('pago_movil', 'transferencia', 'tarjeta', 'zelle', 'cashea'));

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0091_mm_cuentas_bancarias_cashea.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
