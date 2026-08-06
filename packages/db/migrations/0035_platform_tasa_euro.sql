-- =============================================================================
-- 0035 - Agrega 'euro' como tipo valido de tasa de PLATAFORMA (comentarios en
-- ASCII plano a proposito: ver 0032/0033, donde tildes/guiones largos se
-- corrompieron al copiar y pegar en el SQL Editor de Supabase y rompieron el
-- parser).
--
-- Hasta ahora public.platform_tasas_cambio.tipo solo aceptaba 'bcv' y
-- 'manual' (ver 0031_platform_tasas_cambio.sql). El admin necesita la misma
-- gestion de 3 tasas en paralelo (BCV, Euro BCV, Personalizada) que ya tiene
-- el minimarket en mm_tasas_cambio (ver 0021_minimarket_tasas_paralelas.sql,
-- que ya acepta 'bcv' | 'euro' | 'manual').
--
-- El CHECK constraint original se definio SIN NOMBRE dentro del CREATE TABLE,
-- asi que Postgres le puso un nombre autogenerado que no se puede adivinar
-- con certeza. Este script lo busca dinamicamente por su definicion (en vez
-- de asumir un nombre) antes de reemplazarlo, para que sea seguro de correr
-- sin importar el nombre real que haya quedado. Idempotente: seguro de correr
-- una y mil veces.
-- =============================================================================

do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.platform_tasas_cambio'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%tipo%'
  loop
    execute format('alter table public.platform_tasas_cambio drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.platform_tasas_cambio
  add constraint platform_tasas_cambio_tipo_check check (tipo in ('bcv', 'euro', 'manual'));

-- Registro en el historial de migraciones (para que pnpm db:migrate no
-- intente reaplicar esto despues).
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0035_platform_tasa_euro.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
