-- =============================================================================
-- 0008 · Almacenamiento de imágenes de productos (Supabase Storage)
-- Bucket público "productos". Las imágenes se guardan bajo la carpeta del tenant
-- (primer segmento de la ruta = tenant_id) y se leen por URL pública.
-- Escritura solo para usuarios autenticados dentro de la carpeta de SU tenant.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('productos', 'productos', true)
on conflict (id) do nothing;

-- Lectura pública (las imágenes se muestran por su URL pública).
drop policy if exists "mm_productos_img_read" on storage.objects;
create policy "mm_productos_img_read" on storage.objects for select
  using (bucket_id = 'productos');

-- Subida: usuario autenticado dentro de la carpeta de su tenant.
drop policy if exists "mm_productos_img_insert" on storage.objects;
create policy "mm_productos_img_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'productos'
    and exists (
      select 1 from public.auth_tenant_ids() t where t::text = (storage.foldername(name))[1]
    )
  );

-- Reemplazo de archivo existente.
drop policy if exists "mm_productos_img_update" on storage.objects;
create policy "mm_productos_img_update" on storage.objects for update to authenticated
  using (
    bucket_id = 'productos'
    and exists (
      select 1 from public.auth_tenant_ids() t where t::text = (storage.foldername(name))[1]
    )
  );

-- Borrado.
drop policy if exists "mm_productos_img_delete" on storage.objects;
create policy "mm_productos_img_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'productos'
    and exists (
      select 1 from public.auth_tenant_ids() t where t::text = (storage.foldername(name))[1]
    )
  );
