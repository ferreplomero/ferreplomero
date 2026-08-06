-- =============================================================================
-- 0036 - Agrega whatsapp al perfil del usuario (comentarios en ASCII plano a
-- proposito: ver 0032/0033, donde tildes/guiones largos se corrompieron al
-- copiar y pegar en el SQL Editor de Supabase y rompieron el parser).
--
-- El registro ahora pide el WhatsApp del usuario (obligatorio, para poder
-- contactarlo/darle soporte). Se guarda en profiles.whatsapp, poblado por el
-- mismo trigger que ya llena full_name/avatar_url desde
-- auth.users.raw_user_meta_data al crear la cuenta. Nullable: los perfiles
-- existentes (creados antes de este cambio) no tienen este dato y no hay
-- forma de rellenarlo retroactivamente.
-- =============================================================================

alter table public.profiles add column if not exists whatsapp text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, whatsapp)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'whatsapp'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Registro en el historial de migraciones (para que pnpm db:migrate no
-- intente reaplicar esto despues).
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0036_profiles_whatsapp.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
