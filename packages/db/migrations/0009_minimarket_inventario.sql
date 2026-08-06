-- =============================================================================
-- 0009 · Inventario premium — campos adicionales del producto
-- Añade a mm_productos: precio de COMPRA (costo), código de barras (escáner) y
-- etiquetas libres para agrupar/filtrar. El impuesto ya vive en `impuesto_id`.
-- Idempotente: usa add column if not exists.
-- =============================================================================

alter table public.mm_productos
  add column if not exists codigo_barras text,
  add column if not exists costo_usd numeric(12, 2) not null default 0 check (costo_usd >= 0),
  add column if not exists etiquetas text[] not null default '{}'::text[];

-- Búsqueda por etiqueta (filtro del inventario) y por código de barras (escáner).
create index if not exists mm_productos_etiquetas_idx
  on public.mm_productos using gin (etiquetas);

-- Código de barras único por tenant cuando está presente (permite escanear sin choques).
create unique index if not exists mm_productos_barras_unico
  on public.mm_productos (tenant_id, codigo_barras)
  where codigo_barras is not null and deleted_at is null;
