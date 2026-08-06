-- =============================================================================
-- 0028 · Configuración global de la plataforma (panel admin)
--
-- Fila única (singleton, id fijo) con los parámetros globales que antes vivían
-- como constantes en el código: zona horaria de referencia del admin y datos
-- de contacto/soporte. Editable desde /admin/configuracion sin tocar código.
--
-- Es de nivel PLATAFORMA (no `mm_`): no tiene relación con
-- `mm_config_negocio.parametros.timezone`, que es la zona horaria propia de
-- CADA negocio para sus propias operaciones (ventas, caja, etc.) — esta tabla
-- es solo la zona horaria de referencia para el panel admin.
-- =============================================================================

create table if not exists public.platform_settings (
  id                 boolean primary key default true,
  timezone           text not null default 'America/Caracas',
  soporte_email      text not null default '',
  soporte_telefono   text not null default '',
  soporte_whatsapp   text not null default '',
  updated_at         timestamptz not null default now(),
  -- Fuerza que solo pueda existir la fila singleton (id siempre `true`).
  constraint platform_settings_singleton check (id)
);

drop trigger if exists set_platform_settings_updated_at on public.platform_settings;
create trigger set_platform_settings_updated_at before update on public.platform_settings
  for each row execute function public.set_updated_at();

insert into public.platform_settings (id) values (true)
on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

-- Lectura: cualquier usuario autenticado (el número de soporte y la zona
-- horaria de referencia se usan en el shell del vertical).
drop policy if exists "platform_settings_select" on public.platform_settings;
create policy "platform_settings_select" on public.platform_settings for select to authenticated
  using (true);

-- Sin políticas de insert/update/delete para `authenticated`: solo el panel
-- admin (con `service_role`, ya gateado por `requireSuperAdmin()`) puede
-- editarla.
