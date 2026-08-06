-- =============================================================================
-- 0015 · Storage: bucket productos + política logos del negocio
--
-- Ejecutar en el SQL Editor de Supabase si las imágenes de productos o el
-- logo del negocio fallan al subirse.
--
-- Qué hace:
--   1. Crea el bucket "productos" si no existe (idempotente).
--   2. Recrea las políticas de Storage para imágenes de productos Y logos
--      del negocio. Ambos usan la misma ruta base:
--        {tenant_id}/...          → imágenes de producto
--        {tenant_id}/logos/...    → logo del negocio
--      En los dos casos, el primer segmento del path ES el tenant_id, por lo
--      que la misma política cubre ambas rutas sin cambios adicionales.
-- =============================================================================

-- 1. Bucket público ----------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('productos', 'productos', true)
on conflict (id) do nothing;

-- 2. Políticas (drop + create para garantizar versión actualizada) -----------------

-- Lectura pública
drop policy if exists "mm_productos_img_read" on storage.objects;
create policy "mm_productos_img_read" on storage.objects
  for select
  using (bucket_id = 'productos');

-- Subida: usuario autenticado, primer segmento = su tenant_id
drop policy if exists "mm_productos_img_insert" on storage.objects;
create policy "mm_productos_img_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'productos'
    and exists (
      select 1
      from public.auth_tenant_ids() t
      where t::text = (storage.foldername(name))[1]
    )
  );

-- Actualización de archivo existente
drop policy if exists "mm_productos_img_update" on storage.objects;
create policy "mm_productos_img_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'productos'
    and exists (
      select 1
      from public.auth_tenant_ids() t
      where t::text = (storage.foldername(name))[1]
    )
  );

-- Borrado
drop policy if exists "mm_productos_img_delete" on storage.objects;
create policy "mm_productos_img_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'productos'
    and exists (
      select 1
      from public.auth_tenant_ids() t
      where t::text = (storage.foldername(name))[1]
    )
  );
