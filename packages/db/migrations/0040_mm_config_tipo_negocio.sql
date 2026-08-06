-- =============================================================================
-- 0040 - Tipo de negocio y onboarding guiado de datos iniciales (minimarket)
-- (comentarios en ASCII plano, ver 0032/0036: tildes rompen el parser al
-- copiar y pegar en el SQL Editor de Supabase).
--
-- Agrega a mm_config_negocio:
--   tipo_negocio        -> rubro elegido por el dueno (texto + CHECK, no enum
--                          de Postgres: mismo criterio que mm_tipo_tasa,
--                          evita el dolor de "alter type add value" si se
--                          agregan mas rubros despues). Se usa para precargar
--                          categorias de inventario sugeridas y, a futuro,
--                          para reportes/segmentacion.
--   datos_completados_en -> marca cuando el dueno termino el paso guiado de
--                          datos iniciales (nombre, RIF, telefono, direccion,
--                          tipo de negocio). NULL = pendiente, fuerza el
--                          asistente en /minimarket/bienvenida.
--
-- GRANDFATHERING: todo negocio que YA existe al correr esta migracion se
-- marca como completado (datos_completados_en = now()) para no forzarle un
-- asistente nuevo de sopeton — solo vera una invitacion opcional en el
-- tablero para elegir su tipo de negocio (tipo_negocio queda NULL para
-- ellos). Los negocios que se aprovisionen DESPUES de esta migracion nacen
-- con datos_completados_en NULL a proposito, para que el asistente los
-- reciba la primera vez que entran.
-- =============================================================================

alter table public.mm_config_negocio add column if not exists tipo_negocio text;
alter table public.mm_config_negocio add column if not exists datos_completados_en timestamptz;

do $$ begin
  alter table public.mm_config_negocio add constraint mm_config_negocio_tipo_negocio_check
    check (tipo_negocio is null or tipo_negocio in (
      'minimarket_abasto', 'bodega', 'licoreria', 'papeleria_libreria', 'charcuteria',
      'panaderia', 'farmacia_perfumeria', 'verduleria_fruteria', 'ferreteria',
      'quincalleria', 'carniceria', 'kiosco', 'tienda_ropa', 'otro'
    ));
exception when duplicate_object then null; end $$;

update public.mm_config_negocio set datos_completados_en = now() where datos_completados_en is null;

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0040_mm_config_tipo_negocio.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
