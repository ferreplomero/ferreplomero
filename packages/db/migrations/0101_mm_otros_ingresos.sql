-- =============================================================================
-- 0101 - Otros ingresos del negocio: dinero que entra SIN ser una venta (ej.
-- aporte del dueno, venta de un activo, un reembolso, un ingreso externo).
--
-- Contexto: hasta ahora la unica fuente de "dinero que entra" que el sistema
-- reconocia era una venta (mm_ventas). Un ingreso real del negocio que no es
-- una venta no tenia donde registrarse -- o se perdia, o alguien lo metia
-- como una "venta" falsa, ensuciando las estadisticas de ventas/ganancias.
--
-- mm_otros_ingresos es el espejo de signo contrario a mm_gastos_operativos
-- (0047 + metodo_pago de 0082 + cuenta_bancaria_id de 0100), con las mismas
-- columnas de origen del dinero desde el principio: metodo_pago (reutiliza
-- el enum existente public.mm_metodo_pago, sin catalogo nuevo) y
-- cuenta_bancaria_id (solo para metodos digitales). Sin columna `categoria`:
-- a diferencia de un gasto operativo (categorias fijas conocidas de
-- antemano), un otro-ingreso es heterogeneo por naturaleza -- la
-- `descripcion` libre es el concepto.
--
-- La logica de negocio (efectivo -> ingreso en mm_caja_movimientos; digital
-- -> ingreso en mm_cuenta_movimientos, via los mismos helpers
-- insertarMovimientoCaja/insertarMovimientoCuenta que ya usa Gastos) vive en
-- TypeScript (apps/web/app/(vertical)/minimarket/reportes/otros-ingresos/
-- actions.ts), no en SQL -- mismo criterio que 0082/0100.
-- =============================================================================

create table if not exists public.mm_otros_ingresos (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  descripcion        text not null check (char_length(descripcion) between 1 and 160),
  monto_usd          numeric(14, 2) not null check (monto_usd > 0),
  fecha              date not null,
  notas              text,
  metodo_pago        public.mm_metodo_pago not null,
  cuenta_bancaria_id uuid null references public.mm_cuentas_bancarias (id) on delete set null,
  usuario_id         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);
create index if not exists mm_otros_ingresos_tenant_idx on public.mm_otros_ingresos (tenant_id);
create index if not exists mm_otros_ingresos_fecha_idx
  on public.mm_otros_ingresos (tenant_id, fecha);

drop trigger if exists set_mm_otros_ingresos_updated_at on public.mm_otros_ingresos;
create trigger set_mm_otros_ingresos_updated_at before update on public.mm_otros_ingresos
  for each row execute function public.set_updated_at();

-- RLS: tabla operativa mutable, mismo patron que mm_gastos_operativos (0047)
-- -- select/insert/update por pertenencia al tenant; borrado logico via
-- deleted_at, sin politica delete.
alter table public.mm_otros_ingresos enable row level security;

drop policy if exists "mm_otros_ingresos_select" on public.mm_otros_ingresos;
create policy "mm_otros_ingresos_select" on public.mm_otros_ingresos for select to authenticated
  using (tenant_id in (select public.auth_tenant_ids()));

drop policy if exists "mm_otros_ingresos_insert" on public.mm_otros_ingresos;
create policy "mm_otros_ingresos_insert" on public.mm_otros_ingresos for insert to authenticated
  with check (tenant_id in (select public.auth_tenant_ids()));

drop policy if exists "mm_otros_ingresos_update" on public.mm_otros_ingresos;
create policy "mm_otros_ingresos_update" on public.mm_otros_ingresos for update to authenticated
  using (tenant_id in (select public.auth_tenant_ids()))
  with check (tenant_id in (select public.auth_tenant_ids()));

-- Sin modulo de permisos nuevo: mismo criterio que mm_gastos_operativos (0047)
-- -- vive dentro de /minimarket/reportes/otros-ingresos, ya cubierto por el
-- modulo 'reportes' existente en mm_permisos_rol.

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0101_mm_otros_ingresos.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
