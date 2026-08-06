-- =============================================================================
-- 0041 - Avisos descartables de la experiencia de primer ingreso (minimarket)
-- (comentarios en ASCII plano, ver 0032/0036: tildes rompen el parser al
-- copiar y pegar en el SQL Editor de Supabase).
--
-- Tres avisos amables y NO obligatorios que se muestran en el tablero cuando
-- corresponde (caja recien abierta en 0, impuestos apagados, medios de pago
-- sin datos reales) y se recuerdan una vez descartados/atendidos, por
-- negocio (mm_config_negocio), igual patron que tipo_negocio/
-- datos_completados_en de la migracion 0040.
--
-- Default false para TODOS (negocios nuevos y existentes): estos avisos se
-- calculan tambien contra el estado REAL del negocio (ver
-- app/(vertical)/minimarket/page.tsx), asi que un negocio que ya activo sus
-- impuestos o ya cargo medios de pago simplemente no los vera, sin importar
-- el valor de estas columnas. No hace falta "graduar" a los negocios
-- existentes como en 0040.
-- =============================================================================

alter table public.mm_config_negocio add column if not exists aviso_caja_visto boolean not null default false;
alter table public.mm_config_negocio add column if not exists aviso_fiscal_visto boolean not null default false;
alter table public.mm_config_negocio add column if not exists aviso_pagos_visto boolean not null default false;

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0041_mm_avisos_bienvenida.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
