-- =============================================================================
-- 0047 - Gastos operativos del negocio (alquiler, sueldos, servicios, etc.) y
-- marca de categoria de deuda "operativa" (comentarios en ASCII plano, ver
-- 0032/0036/0042/0046).
--
-- Contexto: la seccion "Ganancias" de Reportes necesita restar gastos reales
-- del periodo para calcular una ganancia NETA honesta. Antes de esta
-- migracion, el sistema solo podia ver egresos de caja (mm_caja_movimientos,
-- tipo='egreso', texto libre sin categoria) -- no habia forma de registrar
-- gastos fijos como alquiler, sueldos o servicios que NO pasan por caja.
--
-- mm_gastos_operativos: registro manual de esos gastos, con categoria fija
-- (lista curada, no personalizable como las categorias de deuda -- no hace
-- falta esa flexibilidad aqui) y monto en USD (base del sistema, igual que
-- mm_deudas.monto_usd). fecha es `date` (calendario puro, sin hora) por el
-- mismo motivo que mm_deudas.fecha: nunca hay conversion de zona horaria que
-- corregir.
--
-- es_gasto_operativo en mm_categorias_deuda: el dueno puede marcar una
-- categoria de deuda (ej. "Alquiler", "Servicios") como gasto operativo real
-- del negocio, distinto de un pasivo/capital (ej. "Prestamo personal",
-- "Familiares"). Solo los abonos a deudas de categorias marcadas asi se
-- restan en la ganancia neta -- evita mezclar el pago de un prestamo
-- personal del dueno con un gasto real del negocio.
-- =============================================================================

-- Categoria de gasto operativo: lista fija curada (no un catalogo
-- personalizable como mm_categorias_deuda -- el universo de gastos fijos de
-- un minimarket venezolano es acotado y conocido de antemano).
do $$ begin
  create type public.mm_gasto_categoria as enum (
    'alquiler', 'servicios', 'sueldos', 'mantenimiento', 'impuestos_permisos', 'otros'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.mm_gastos_operativos (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  descripcion text not null check (char_length(descripcion) between 1 and 160),
  categoria   public.mm_gasto_categoria not null default 'otros',
  monto_usd   numeric(14, 2) not null check (monto_usd > 0),
  fecha       date not null,
  notas       text,
  usuario_id  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists mm_gastos_operativos_tenant_idx on public.mm_gastos_operativos (tenant_id);
create index if not exists mm_gastos_operativos_fecha_idx
  on public.mm_gastos_operativos (tenant_id, fecha);

drop trigger if exists set_mm_gastos_operativos_updated_at on public.mm_gastos_operativos;
create trigger set_mm_gastos_operativos_updated_at before update on public.mm_gastos_operativos
  for each row execute function public.set_updated_at();

-- RLS: tabla operativa mutable, mismo patron que 0007/0046 (select/insert/
-- update por pertenencia al tenant; borrado logico via deleted_at, sin
-- politica delete).
alter table public.mm_gastos_operativos enable row level security;

drop policy if exists "mm_gastos_operativos_select" on public.mm_gastos_operativos;
create policy "mm_gastos_operativos_select" on public.mm_gastos_operativos for select to authenticated
  using (tenant_id in (select public.auth_tenant_ids()));

drop policy if exists "mm_gastos_operativos_insert" on public.mm_gastos_operativos;
create policy "mm_gastos_operativos_insert" on public.mm_gastos_operativos for insert to authenticated
  with check (tenant_id in (select public.auth_tenant_ids()));

drop policy if exists "mm_gastos_operativos_update" on public.mm_gastos_operativos;
create policy "mm_gastos_operativos_update" on public.mm_gastos_operativos for update to authenticated
  using (tenant_id in (select public.auth_tenant_ids()))
  with check (tenant_id in (select public.auth_tenant_ids()));

-- Sin modulo de permisos nuevo: los gastos operativos son informacion
-- financiera de control interno igual de sensible que Reportes/Finanzas, y
-- viven dentro de /minimarket/reportes/gastos -- ya cubierto por el modulo
-- 'reportes' existente en mm_permisos_rol (ver lib/minimarket/permisos.ts).

-- Categoria de deuda operativa (ver mm_categorias_deuda, migracion 0046).
alter table public.mm_categorias_deuda
  add column if not exists es_gasto_operativo boolean not null default false;

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0047_mm_gastos_operativos.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
