-- =============================================================================
-- 0038 - Estado explicito en ventas en espera del POS minimarket (comentarios
-- en ASCII plano a proposito: ver 0032/0033/0035/0036/0037, donde tildes/
-- guiones largos se corrompieron al copiar y pegar en el SQL Editor de
-- Supabase y rompieron el parser).
--
-- BUG que corrige: mm_ventas_pendientes (0037) no tenia forma de distinguir
-- "el borrador que el cajero tiene abierto ahora mismo en el carrito" de "una
-- venta que el cajero dejo a un lado a proposito para atender otra". El POS
-- usaba un truco fragil (comparar el id de la fila contra el cartId activo
-- en memoria) para que el panel "En espera" excluyera la primera -- si por
-- cualquier motivo el cartId activo no rotaba a tiempo (ej. PowerSync
-- todavia inicializando cuando el cajero cerro el dialogo de cobro), la fila
-- SI se guardaba pero el panel la seguia excluyendo, porque para el POS
-- seguia siendo "la venta activa". Resultado: la venta se guardaba de verdad
-- pero nunca aparecia en "En espera".
--
-- La correccion real es un campo de estado explicito en la fila misma, no un
-- truco de comparacion de ids en el cliente:
--   'activo'    -> el borrador que un dispositivo tiene abierto ahora mismo
--                  (autoguardado continuo; nunca se muestra en "En espera").
--   'en_espera' -> el cajero la dejo a un lado a proposito (cerro el cobro
--                  sin pagar, o toco "Dejar en espera"); el panel filtra
--                  SOLO por este estado, sin depender de ningun id en
--                  memoria del cliente.
-- =============================================================================

alter table public.mm_ventas_pendientes
  add column if not exists estado text not null default 'activo'
    check (estado in ('activo', 'en_espera'));

create index if not exists mm_ventas_pendientes_estado_idx
  on public.mm_ventas_pendientes (tenant_id, sucursal_id, estado, updated_at desc);

-- Registro en el historial de migraciones (para que pnpm db:migrate no
-- intente reaplicar esto despues).
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0038_ventas_pendientes_estado.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
