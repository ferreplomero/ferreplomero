-- =============================================================================
-- 0045 - Corrige mm_compras.fecha guardada en UTC en vez de la zona horaria
-- del negocio (comentarios en ASCII plano, ver 0032/0036/0042).
--
-- Bug: el formulario de "Nueva compra" usa <input type="date"> (produce un
-- string "YYYY-MM-DD" sin hora) y ese string se insertaba TAL CUAL en
-- mm_compras.fecha (timestamptz). Postgres interpreta ese literal como
-- medianoche EN LA ZONA HORARIA DE LA SESION (UTC en Supabase), no en la
-- zona horaria del negocio (America/Caracas por defecto, UTC-4). Resultado:
-- una compra que el usuario registro como "16 jul" quedaba guardada como
-- 2026-07-16 00:00:00 UTC, que al mostrarse convertida a America/Caracas
-- cae en 2026-07-15 20:00 -- un dia antes de lo elegido.
--
-- El codigo de la app (apps/web/.../compras/actions.ts y compra-form.tsx)
-- ya se corrigio para anclar la fecha elegida a medianoche en la zona
-- horaria del negocio ANTES de insertarla (mismo criterio que
-- rangoLocalAUtc/medianocheLocalAUtcISO, ya usados por ventas y reportes).
--
-- Esta migracion corrige los datos YA guardados con el bug. Identifica las
-- filas afectadas por su firma exacta (fecha cae exactamente en medianoche
-- UTC, sin resto de horas/minutos/segundos -- ninguna fecha corregida por
-- el codigo nuevo puede volver a coincidir con esa firma salvo en UTC
-- mismo, que ya no es una zona horaria de negocio valida por defecto) y
-- reinterpreta esa misma fecha de calendario como medianoche en la zona
-- horaria configurada de cada tenant (mm_config_negocio.parametros
-- ->> 'timezone', o America/Caracas si el tenant no la configuro).
-- =============================================================================

update public.mm_compras c
set fecha = (
  (date(c.fecha at time zone 'utc'))::timestamp
    at time zone coalesce(nullif(cfg.parametros ->> 'timezone', ''), 'America/Caracas')
)
from public.mm_config_negocio cfg
where cfg.tenant_id = c.tenant_id
  and c.fecha = (date_trunc('day', c.fecha at time zone 'utc') at time zone 'utc');

-- Tenants sin fila propia en mm_config_negocio (no deberia ocurrir, pero
-- por si acaso): mismo ajuste usando el default America/Caracas.
update public.mm_compras c
set fecha = (date(c.fecha at time zone 'utc'))::timestamp at time zone 'America/Caracas'
where c.fecha = (date_trunc('day', c.fecha at time zone 'utc') at time zone 'utc')
  and not exists (select 1 from public.mm_config_negocio cfg where cfg.tenant_id = c.tenant_id);

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0045_mm_compras_fecha_timezone_fix.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
