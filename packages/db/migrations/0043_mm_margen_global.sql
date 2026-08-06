-- =============================================================================
-- 0043 - Margen de ganancia global por defecto, con excepcion por producto
-- (comentarios en ASCII plano, ver 0032/0036: tildes rompen el parser al
-- copiar y pegar en el SQL Editor de Supabase).
--
-- El margen global activo/porcentaje (margen_global_activo, margen_global_pct)
-- vive dentro del JSONB mm_config_negocio.parametros, igual patron que
-- igtf_activo/iva_activo/iva_pct -- no hace falta columna nueva ahi.
--
-- mm_productos.usa_margen_global marca si el precio de venta de ESE producto
-- sigue el margen global (se recalcula cuando el dueno cambia el % global y
-- pulsa "Recalcular productos con margen global") o si tiene un margen/precio
-- personalizado (nunca se toca automaticamente).
--
-- Default false: activar el margen global por primera vez NO debe marcar de
-- golpe todo el catalogo existente como "sigue el global" -- solo los
-- productos NUEVOS que se creen con el margen global activo (y sin que el
-- usuario edite el % o el precio a mano) nacen con usa_margen_global = true.
-- =============================================================================

alter table public.mm_productos add column if not exists usa_margen_global boolean not null default false;

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0043_mm_margen_global.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
