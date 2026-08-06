-- =============================================================================
-- 0089 - Zelle se suma a mm_cuentas_bancarias (0083) como una cuenta mas, junto
-- a pago_movil/transferencia/tarjeta. A diferencia de esas tres (que se
-- identifican por banco), Zelle se identifica por CORREO -- se agrega la
-- columna `correo` (obligatoria solo para metodo = 'zelle', via CHECK) y se
-- amplia el CHECK de `metodo` para aceptarlo.
--
-- `banco` sigue NOT NULL para no tocar ningun codigo existente que ya lee
-- `cuenta.banco` como encabezado (listado/detalle de Bancos, selector de
-- cuenta en el POS, boton de vuelto digital, recibo, Finanzas): para una
-- cuenta Zelle se guarda el MISMO correo en `banco` y en `correo`. El correo
-- es justo lo que identifica una cuenta Zelle frente al cliente, asi que
-- mostrarlo donde antes se mostraba el nombre del banco es lo correcto, y
-- ademas distingue cuentas Zelle entre si cuando el negocio tiene varias (a
-- diferencia de repetir el texto fijo "Zelle" en cada una).
--
-- Zelle ya causaba IGTF y ya se liquidaba en USD antes de esta migracion (ver
-- METODOS_DIVISA en constants.ts) -- eso NO cambia, no se toca esa logica.
-- Esta migracion solo conecta Zelle con el ledger de mm_cuenta_movimientos
-- (saldo + historial), igual que los otros 3 metodos desde 0083/0084.
-- =============================================================================

-- --- Ampliar el CHECK de metodo para aceptar 'zelle' ---------------------------
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
    check (metodo in ('pago_movil', 'transferencia', 'tarjeta', 'zelle'));

-- --- Columna correo: obligatoria (con forma de email) solo para Zelle ----------
alter table public.mm_cuentas_bancarias
  add column if not exists correo text;

alter table public.mm_cuentas_bancarias
  drop constraint if exists mm_cuentas_bancarias_correo_zelle_check;
alter table public.mm_cuentas_bancarias
  add constraint mm_cuentas_bancarias_correo_zelle_check
    check (
      metodo <> 'zelle'
      or (correo is not null and correo ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
    );

comment on column public.mm_cuentas_bancarias.correo is
  'Correo Zelle de la cuenta (obligatorio solo si metodo = zelle, con forma de '
  'email). NULL para pago_movil/transferencia/tarjeta -- esos se identifican '
  'por banco.';

-- --- Migracion best-effort del identificador plano de Zelle que ya existia -----
-- (`mm_config_negocio.metodos_pago[].zelle_identificador`, ver metodos-pago.ts,
-- que hasta hoy aceptaba email O telefono). Solo migra filas donde ese valor ya
-- tiene forma de correo y el negocio aun no tiene ninguna cuenta Zelle -- si no
-- calza (era un telefono, o no habia nada cargado), no se pierde nada: el jsonb
-- original no se toca y el negocio simplemente agrega su cuenta Zelle de nuevo
-- en Configuracion con el formulario nuevo.
insert into public.mm_cuentas_bancarias
  (tenant_id, metodo, banco, titular, rif, correo, predeterminada, activa)
select
  c.tenant_id,
  'zelle'::public.mm_metodo_pago,
  trim(m ->> 'zelle_identificador'),
  coalesce(nullif(trim(m ->> 'titular'), ''), 'Titular sin especificar'),
  null,
  trim(m ->> 'zelle_identificador'),
  true,
  true
from public.mm_config_negocio c
cross join lateral jsonb_array_elements(c.metodos_pago) as m
where (m ->> 'metodo') = 'zelle'
  and trim(coalesce(m ->> 'zelle_identificador', '')) ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  and not exists (
    select 1 from public.mm_cuentas_bancarias existing
    where existing.tenant_id = c.tenant_id
      and existing.metodo = 'zelle'
      and existing.deleted_at is null
  );

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0089_mm_cuentas_bancarias_zelle.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
