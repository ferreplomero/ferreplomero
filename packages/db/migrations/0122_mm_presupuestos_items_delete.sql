-- =============================================================================
-- 0122 - Politica de BORRADO para mm_presupuestos_items (comentarios en ASCII
-- plano a proposito: ver 0032/0033/0035/0036, donde tildes/guiones largos se
-- corrompieron al copiar y pegar en el SQL Editor de Supabase).
--
-- Bug: 0102 creo politicas select/insert/update pero NO delete para los items
-- del presupuesto. Al editar un presupuesto, la app borra sus items y vuelve a
-- insertar los nuevos (actualizarPresupuesto), pero con RLS sin politica de
-- delete el borrado afectaba 0 filas EN SILENCIO: los items viejos quedaban y
-- el presupuesto mostraba los productos repetidos (los totales guardados si
-- eran correctos, porque salen solo de los items nuevos).
--
-- 1) Politica de delete, mismo alcance por tenant que las demas.
-- 2) Limpieza de los duplicados ya existentes: cada guardado inserta TODOS
--    los items en una sola sentencia, asi que comparten el mismo created_at.
--    Los items vigentes de un presupuesto son los del ultimo guardado (el de
--    created_at mas reciente); los de guardados anteriores son los viejos que
--    no se pudieron borrar. Un presupuesto nunca editado tiene un solo lote y
--    no se toca.
-- =============================================================================

drop policy if exists "mm_presupuestos_items_delete" on public.mm_presupuestos_items;
create policy "mm_presupuestos_items_delete" on public.mm_presupuestos_items
  for delete to authenticated
  using (tenant_id in (select public.auth_tenant_ids()));

delete from public.mm_presupuestos_items i
where i.created_at < (
  select max(j.created_at)
  from public.mm_presupuestos_items j
  where j.presupuesto_id = i.presupuesto_id
);

-- Registro en el historial de migraciones (para que pnpm db:migrate no
-- intente reaplicar esto despues).
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0122_mm_presupuestos_items_delete.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
