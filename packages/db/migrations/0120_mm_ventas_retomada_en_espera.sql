-- =============================================================================
-- 0120 - Quien retomo una venta que estaba "en espera" (comentarios en ASCII
-- plano a proposito: ver 0032/0033/0035/0036, donde tildes/guiones largos se
-- corrompieron al copiar y pegar en el SQL Editor de Supabase).
--
-- Las ventas en espera (mm_ventas_pendientes, 0037/0038) ahora son visibles
-- para TODOS los usuarios de la sucursal. Cuando un usuario retoma una venta
-- que dejo en espera otro (o el mismo) y la cobra, la venta final registra:
--   retomada_por_*   -> quien la retomo y la cobro (nombre + rol).
--   en_espera_por_*  -> quien la habia dejado en espera (nombre + rol).
-- Nombre y rol se guardan como texto (foto del momento): si luego cambian el
-- nombre del perfil o el rol del usuario, el historial de la venta no cambia.
--
-- Solo metadatos de auditoria: NO tocan montos, caja, bancos, fiado ni stock.
-- Todas nullable: una venta normal (no retomada) las deja en null.
-- =============================================================================

alter table public.mm_ventas
  add column if not exists retomada_por_id     uuid references public.profiles (id) on delete set null,
  add column if not exists retomada_por_nombre text,
  add column if not exists retomada_por_rol    text,
  add column if not exists retomada_at         timestamptz,
  add column if not exists en_espera_por_id     uuid references public.profiles (id) on delete set null,
  add column if not exists en_espera_por_nombre text,
  add column if not exists en_espera_por_rol    text;

-- Registro en el historial de migraciones (para que pnpm db:migrate no
-- intente reaplicar esto despues).
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0120_mm_ventas_retomada_en_espera.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
