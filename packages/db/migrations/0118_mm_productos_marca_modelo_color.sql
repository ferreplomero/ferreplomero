-- =============================================================================
-- 0118 - Marca, modelo y color opcionales por producto
-- (comentarios en ASCII plano, ver 0032/0036: tildes rompen el parser al
-- copiar y pegar en el SQL Editor de Supabase).
--
-- Atributos descriptivos OPCIONALES de un producto (util en ferreteria:
-- ej. una llave Stanley modelo STHT16-125, un cable color negro). Ninguno
-- de los tres es obligatorio -- un producto existente sin estos datos sigue
-- funcionando exactamente igual, y crear/editar uno sin llenarlos tampoco
-- rompe nada (columnas nullable, sin default distinto de null).
--
-- `color` se guarda como texto libre (no un enum): el formulario ofrece un
-- selector de color (input nativo, hex #RRGGBB) pero el usuario tambien
-- puede escribir un nombre ("rojo", "gris claro") -- cualquiera de los dos
-- formatos es un texto valido en esta columna.
-- =============================================================================

alter table public.mm_productos add column if not exists marca text;
alter table public.mm_productos add column if not exists modelo text;
alter table public.mm_productos add column if not exists color text;

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0118_mm_productos_marca_modelo_color.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
