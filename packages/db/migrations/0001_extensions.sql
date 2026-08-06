-- =============================================================================
-- 0001 · Extensiones y utilidades base
-- =============================================================================

-- Generación de UUID y funciones criptográficas (gen_random_uuid()).
create extension if not exists "pgcrypto" with schema extensions;

-- Función genérica para mantener `updated_at` al día en cualquier tabla.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
