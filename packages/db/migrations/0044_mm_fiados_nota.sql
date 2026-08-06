-- =============================================================================
-- 0044 - Nota opcional por fiado (comentarios en ASCII plano, ver 0032/0036/0043:
-- tildes rompen el parser al copiar y pegar en el SQL Editor de Supabase).
--
-- mm_fiados no tenia forma de guardar contexto de la deuda (ej. "productos
-- varios", "deuda de enero"). Hace falta para la carga masiva de fiados desde
-- Excel (el comerciante trae una columna de descripcion en su planilla), pero
-- es un campo de uso general -- cualquier fiado, manual o importado, puede
-- llevar una nota.
-- =============================================================================

alter table public.mm_fiados
  add column if not exists nota text check (char_length(nota) <= 500);

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0044_mm_fiados_nota.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
