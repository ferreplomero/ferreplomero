-- =============================================================================
-- 0103 - mm_compras_items.actualizar_costo -- comentarios en ASCII plano, ver
-- 0032/0033/0035/0036/0037/0046.
--
-- Hasta ahora, al marcar una compra "recibida", aplicarRecepcion()
-- (apps/web/app/(vertical)/minimarket/compras/actions.ts) actualizaba
-- costo_usd del producto de forma INCONDICIONAL para todos los items, sin
-- preguntar nada y sin tocar precio_usd. Esta columna guarda la decision del
-- usuario ("actualizar el costo/precio en inventario" vs "mantenerlo, esta
-- compra solo registra su costo real") en el momento de crear la compra --
-- necesaria porque una compra puede quedar en 'borrador' y confirmarse mucho
-- despues (confirmarRecepcion), cuando ya no hay ningun formulario en pantalla
-- para volver a preguntar.
--
-- Default 'true' a nivel de columna es solo una salvaguarda de esquema (una
-- fila sin este dato explicito no debe interpretarse como "nunca
-- actualizar"); en la practica el formulario de compras SIEMPRE manda el
-- valor explicito que el usuario eligio para cada item (por defecto 'false'
-- en la UI cuando hay un cambio de costo detectado, ver compra-form.tsx).
-- =============================================================================

alter table public.mm_compras_items
  add column if not exists actualizar_costo boolean not null default true;

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0103_mm_compras_items_actualizar_costo.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
