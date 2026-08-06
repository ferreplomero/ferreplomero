-- =============================================================================
-- 0034 - Configuracion de plataforma completa (platform_settings +
-- platform_tasas_cambio + gastos_plataforma), en el ORDEN CORRECTO de
-- dependencias (comentarios en ASCII plano a proposito: ver 0032/0033, donde
-- tildes/guiones largos se corrompieron al copiar y pegar en el SQL Editor de
-- Supabase y rompieron el parser).
--
-- Consolida, de forma idempotente, lo que 0028 (platform_settings), 0031
-- (platform_tasas_cambio) y 0033 (gastos_plataforma) ya definen por separado,
-- por si ninguno de esos archivos llego a aplicarse en la base de datos en
-- vivo todavia. Seguro de correr una y mil veces: todo usa IF NOT EXISTS.
--
-- Columnas que el codigo espera:
--   public.platform_settings: timezone, soporte_email, soporte_telefono,
--     soporte_whatsapp.
--   public.platform_tasas_cambio: valor, fuente, tipo, usuario_id.
-- =============================================================================

-- =============================================================================
-- 1) platform_settings (fila unica/singleton con la configuracion global).
-- =============================================================================
create table if not exists public.platform_settings (
  id                 boolean primary key default true,
  timezone           text not null default 'America/Caracas',
  soporte_email      text not null default '',
  soporte_telefono   text not null default '',
  soporte_whatsapp   text not null default '',
  updated_at         timestamptz not null default now(),
  constraint platform_settings_singleton check (id)
);

-- Si la tabla ya existia sin alguna columna, se agregan una por una.
alter table public.platform_settings add column if not exists timezone text not null default 'America/Caracas';
alter table public.platform_settings add column if not exists soporte_email text not null default '';
alter table public.platform_settings add column if not exists soporte_telefono text not null default '';
alter table public.platform_settings add column if not exists soporte_whatsapp text not null default '';
alter table public.platform_settings add column if not exists updated_at timestamptz not null default now();

drop trigger if exists set_platform_settings_updated_at on public.platform_settings;
create trigger set_platform_settings_updated_at before update on public.platform_settings
  for each row execute function public.set_updated_at();

-- Fila unica con los valores por defecto: sin esto, cualquier lectura de
-- configuracion cae en los defaults del codigo en vez de los reales.
insert into public.platform_settings (id) values (true)
on conflict (id) do nothing;

alter table public.platform_settings enable row level security;
drop policy if exists "platform_settings_select" on public.platform_settings;
create policy "platform_settings_select" on public.platform_settings for select to authenticated
  using (true);

-- =============================================================================
-- 2) platform_tasas_cambio - tasa BCV/manual de referencia de la plataforma;
-- sirve para sembrar la tasa inicial de un tenant nuevo (ver
-- lib/minimarket/onboarding.ts) cuando el propio negocio aún no tiene una.
-- =============================================================================
create table if not exists public.platform_tasas_cambio (
  id          uuid primary key default gen_random_uuid(),
  valor       numeric(18, 2) not null check (valor > 0),
  fuente      text not null check (fuente in ('auto', 'manual')),
  tipo        text not null check (tipo in ('bcv', 'manual')),
  usuario_id  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists platform_tasas_cambio_tipo_idx
  on public.platform_tasas_cambio (tipo, created_at desc);

alter table public.platform_tasas_cambio enable row level security;
drop policy if exists "platform_tasas_cambio_select" on public.platform_tasas_cambio;
create policy "platform_tasas_cambio_select" on public.platform_tasas_cambio
  for select to authenticated using (true);

-- =============================================================================
-- 3) gastos_plataforma - registro de costos internos para el Estado de
-- Resultados de /admin/finanzas.
-- =============================================================================
create table if not exists public.gastos_plataforma (
  id uuid primary key default gen_random_uuid(),
  concepto text not null check (char_length(concepto) between 1 and 200),
  categoria text not null default 'operativo',
  monto_usd numeric(12, 2) not null check (monto_usd > 0),
  fecha date not null default current_date,
  notas text check (char_length(notas) <= 500),
  creado_por uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gastos_plataforma_fecha_idx on public.gastos_plataforma (fecha desc);
drop trigger if exists set_gastos_plataforma_updated_at on public.gastos_plataforma;
create trigger set_gastos_plataforma_updated_at before update on public.gastos_plataforma
  for each row execute function public.set_updated_at();
alter table public.gastos_plataforma enable row level security;
-- Sin politicas para "authenticated": solo el panel admin (service_role) lee
-- y escribe, mismo patron que admin_audit_log.

-- =============================================================================
-- 4) Registro en el historial de migraciones (para que pnpm db:migrate no
-- intente reaplicar esto despues).
-- =============================================================================
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values
  ('0028_platform_settings.sql'),
  ('0031_platform_tasas_cambio.sql'),
  ('0033_gastos_plataforma.sql'),
  ('0034_plans_columnas_completas.sql')
on conflict (version) do nothing;

-- =============================================================================
-- 5) Fuerza a PostgREST a refrescar su cache de esquema de inmediato. Cubre
-- el caso de columnas ya creadas pero API todavia sirviendo el esquema viejo
-- desde cache.
-- =============================================================================
NOTIFY pgrst, 'reload schema';
