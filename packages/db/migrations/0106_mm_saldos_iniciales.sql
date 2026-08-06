-- =============================================================================
-- 0106 - Configuracion obligatoria de medios de pago y saldos iniciales.
--
-- Contexto: hasta ahora un negocio podia empezar a operar sin declarar cuanto
-- dinero tenia en caja o en sus cuentas digitales -- la caja se auto-abre en
-- $0/Bs 0 y los medios de pago quedan con sus valores por defecto. El dinero
-- que un negocio declara despues como "lo que ya tenia" se confundia con
-- ingresos normales, sin quedar identificado en ningun lado.
--
-- Agrega a mm_config_negocio:
--   medios_saldos_completados_en -> marca cuando el negocio termino de elegir
--                                   al menos un medio de pago y declarar su
--                                   saldo inicial (caja y/o cuentas). NULL =
--                                   pendiente.
--   medios_saldos_aviso_visto_en -> marca cuando el negocio vio/descarto el
--                                   modal de aviso (independiente de haberlo
--                                   completado).
--   medios_saldos_es_legado      -> true = el tenant ya existia antes de esta
--                                   migracion (ve el modal de aviso, no un
--                                   paso obligatorio en su flujo de bienvenida).
--
-- GRANDFATHERING (mismo patron que 0040): el default `true` de la sentencia de
-- abajo marca automaticamente como "legado" a TODO negocio que ya existe al
-- correr esta migracion. Luego se baja el default a `false` para que los
-- tenants aprovisionados DESPUES de esta migracion nazcan marcados como
-- "nuevos" sin necesidad de leer ninguna fecha.
--
-- mm_saldos_iniciales es un ledger de solo auditoria (append-only, igual
-- patron que mm_otros_ingresos/mm_cuenta_movimientos): identifica que un
-- monto es "saldo inicial declarado" y no una venta ni una ganancia. El
-- movimiento de dinero real (que sube el saldo esperado de caja o de la
-- cuenta bancaria) se hace en TypeScript reutilizando insertarMovimientoCaja/
-- insertarMovimientoCuenta que YA existen (mismo criterio que 0101), con
-- `referencia` apuntando a la fila de esta tabla.
-- =============================================================================

alter table public.mm_config_negocio add column if not exists medios_saldos_completados_en timestamptz;
alter table public.mm_config_negocio add column if not exists medios_saldos_aviso_visto_en timestamptz;
alter table public.mm_config_negocio add column if not exists medios_saldos_es_legado boolean not null default true;

alter table public.mm_config_negocio alter column medios_saldos_es_legado set default false;

create table if not exists public.mm_saldos_iniciales (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  destino     text not null check (destino in ('caja', 'cuenta_bancaria')),
  cuenta_id   uuid references public.mm_cuentas_bancarias (id) on delete set null,
  monto_usd   numeric(14, 2) not null default 0 check (monto_usd >= 0),
  monto_bs    numeric(16, 2) not null default 0 check (monto_bs >= 0),
  tasa_usada  numeric(18, 6),
  usuario_id  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists mm_saldos_iniciales_tenant_idx on public.mm_saldos_iniciales (tenant_id);

-- RLS: ledger append-only (solo select + insert, inmutable) -- mismo patron
-- que mm_cuenta_movimientos (0084).
alter table public.mm_saldos_iniciales enable row level security;

drop policy if exists "mm_saldos_iniciales_select" on public.mm_saldos_iniciales;
create policy "mm_saldos_iniciales_select" on public.mm_saldos_iniciales for select to authenticated
  using (tenant_id in (select public.auth_tenant_ids()));

drop policy if exists "mm_saldos_iniciales_insert" on public.mm_saldos_iniciales;
create policy "mm_saldos_iniciales_insert" on public.mm_saldos_iniciales for insert to authenticated
  with check (tenant_id in (select public.auth_tenant_ids()));

-- Sin modulo de permisos nuevo: vive dentro de /minimarket/configuracion,
-- ya cubierto por el modulo 'configuracion' existente en mm_permisos_rol.

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0106_mm_saldos_iniciales.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
