-- =============================================================================
-- 0051 - Avisos importantes del panel admin (tablero del Minimarket)
-- (comentarios en ASCII plano, ver 0032/0036/0040/0042/0045/0046/0047/0048/0050).
--
-- El super admin (arkiteqdata@gmail.com) publica avisos (titulo, mensaje
-- corto, contenido detallado, tipo, fecha de vencimiento) desde
-- /admin/avisos. Se muestran en el tablero de TODOS los usuarios del
-- vertical Minimarket -- son globales de la plataforma, NO por tenant (no
-- llevan tenant_id a proposito).
--
-- producto_slug referencia a products.slug (unique, ver 0002) y queda fijo
-- en 'minimarket' desde la app por ahora -- el modelo ya queda preparado
-- para que otro vertical futuro tenga sus propios avisos por separado sin
-- ninguna migracion nueva, solo publicando con otro producto_slug: cada
-- vertical filtra sus propios avisos por su propio slug, nunca los de otro.
--
-- Vigencia: un aviso se deja de mostrar SOLO (a) si activo = false, o
-- (b) si ya paso su vence_at -- ambas condiciones se verifican DOS veces,
-- en la politica RLS de select (para que ni siquiera una consulta directa
-- del cliente pueda leer un aviso vencido/inactivo) y otra vez en la
-- consulta de la app (defensa en profundidad, mismo criterio que el resto
-- del proyecto). vence_at se calcula en la app como la medianoche local
-- (zona horaria de platform_settings.timezone) del dia SIGUIENTE a la fecha
-- de vencimiento elegida por el admin -- el aviso queda visible durante
-- TODO ese dia en hora de Venezuela (mismo criterio que rangoLocalAUtc en
-- lib/minimarket/date-format.ts).
--
-- Descarte por usuario (opcional, para que un aviso ya leido no se repita):
-- platform_avisos_descartados es una marca simple por (aviso, profile) --
-- cada usuario autenticado solo puede leer/insertar SUS PROPIAS filas (RLS
-- con profile_id = auth.uid()), nunca las de otro usuario. No se puede
-- "des-descartar" (no hace falta: si el admin quiere que todos lo vuelvan a
-- ver, publica un aviso nuevo).
--
-- Escritura de platform_avisos: SOLO service_role (el panel admin) -- no
-- hay politicas de insert/update/delete para `authenticated`, mismo
-- criterio que products/plans (catalogo de lectura publica, escritura solo
-- admin).
-- =============================================================================

do $$ begin
  create type public.platform_aviso_tipo as enum ('informativo', 'mejora', 'mantenimiento', 'importante');
exception when duplicate_object then null; end $$;

create table if not exists public.platform_avisos (
  id            uuid primary key default gen_random_uuid(),
  producto_slug text not null references public.products (slug) on delete cascade,
  titulo        text not null,
  mensaje_corto text not null,
  contenido     text not null,
  tipo          public.platform_aviso_tipo not null default 'informativo',
  activo        boolean not null default true,
  vence_at      timestamptz not null,
  creado_por    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists platform_avisos_vigentes_idx
  on public.platform_avisos (producto_slug, activo, vence_at);

-- Reutiliza la funcion ya existente (0001_extensions.sql) -- no se crea
-- ninguna nueva.
drop trigger if exists set_platform_avisos_updated_at on public.platform_avisos;
create trigger set_platform_avisos_updated_at before update on public.platform_avisos
  for each row execute function public.set_updated_at();

alter table public.platform_avisos enable row level security;

drop policy if exists "platform_avisos_select_vigentes" on public.platform_avisos;
create policy "platform_avisos_select_vigentes" on public.platform_avisos
  for select to authenticated
  using (activo = true and vence_at > now());
-- Sin politicas de insert/update/delete para `authenticated`: intencional.

-- `id` propia (en vez de PK compuesta) a proposito: el helper generico de
-- PowerSync (lib/minimarket/powersync/crud-writer.ts) tipa `TableName` como
-- TODAS las tablas del esquema y asume una columna `id` en cualquiera --
-- aunque esta tabla no sincroniza por PowerSync, sigue siendo parte de ese
-- union de tipos. La unicidad real (un descarte por usuario y aviso) la
-- garantiza el `unique` de abajo, no la PK.
create table if not exists public.platform_avisos_descartados (
  id            uuid primary key default gen_random_uuid(),
  aviso_id      uuid not null references public.platform_avisos (id) on delete cascade,
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  descartado_at timestamptz not null default now(),
  unique (aviso_id, profile_id)
);

alter table public.platform_avisos_descartados enable row level security;

drop policy if exists "platform_avisos_descartados_select_own" on public.platform_avisos_descartados;
create policy "platform_avisos_descartados_select_own" on public.platform_avisos_descartados
  for select to authenticated
  using (profile_id = auth.uid());

drop policy if exists "platform_avisos_descartados_insert_own" on public.platform_avisos_descartados;
create policy "platform_avisos_descartados_insert_own" on public.platform_avisos_descartados
  for insert to authenticated
  with check (profile_id = auth.uid());

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0051_platform_avisos.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
