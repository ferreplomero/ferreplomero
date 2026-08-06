-- =============================================================================
-- 0002 · Esquema base multiinquilino y catálogo de productos
-- Todas las tablas llevan los datos necesarios para aislamiento por tenant.
-- Las políticas RLS se definen en 0003.
-- =============================================================================

-- --- Tipos enumerados ---------------------------------------------------------
do $$ begin
  create type public.membership_role as enum ('propietario', 'administrador', 'colaborador');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.product_status as enum ('disponible', 'proximamente');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.plan_interval as enum ('mensual', 'anual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.subscription_status as enum ('prueba', 'activa', 'morosa', 'pausada', 'cancelada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.entitlement_status as enum ('activo', 'suspendido', 'cancelado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.country_code as enum ('VE', 'CO');
exception when duplicate_object then null; end $$;

-- --- profiles (1:1 con auth.users) --------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- --- tenants (negocios) -------------------------------------------------------
create table if not exists public.tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 120),
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  country     public.country_code not null default 'VE',
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- --- memberships (usuario ⇄ tenant + rol) -------------------------------------
create table if not exists public.memberships (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  role        public.membership_role not null default 'colaborador',
  created_at  timestamptz not null default now(),
  unique (tenant_id, profile_id)
);
create index if not exists memberships_profile_idx on public.memberships (profile_id);
create index if not exists memberships_tenant_idx on public.memberships (tenant_id);

-- --- products (catálogo de SaaS verticales) -----------------------------------
create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name         text not null,
  tagline      text not null,
  description  text not null,
  category     text not null,
  icon         text not null default 'package',
  accent_color text not null default '#4E9E91',
  status       public.product_status not null default 'disponible',
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

-- --- plans (precios por producto) ---------------------------------------------
create table if not exists public.plans (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products (id) on delete cascade,
  slug          text not null,
  name          text not null,
  description   text not null default '',
  price_cents   bigint not null default 0 check (price_cents >= 0),
  currency      text not null default 'USD',
  interval      public.plan_interval not null default 'mensual',
  features_json jsonb not null default '[]'::jsonb,
  is_featured   boolean not null default false,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  unique (product_id, slug)
);

-- --- subscriptions (relación comercial tenant ⇄ plan) -------------------------
create table if not exists public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants (id) on delete cascade,
  plan_id                  uuid not null references public.plans (id) on delete restrict,
  status                   public.subscription_status not null default 'prueba',
  current_period_start     timestamptz not null default now(),
  current_period_end       timestamptz,
  provider                 text not null default 'manual',
  provider_subscription_id text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index if not exists subscriptions_tenant_idx on public.subscriptions (tenant_id);

-- --- entitlements (FUENTE DE VERDAD del acceso a cada SaaS) --------------------
create table if not exists public.entitlements (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  product_id  uuid not null references public.products (id) on delete cascade,
  plan_id     uuid references public.plans (id) on delete set null,
  status      public.entitlement_status not null default 'activo',
  source      text not null default 'suscripcion',
  granted_at  timestamptz not null default now(),
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, product_id)
);
create index if not exists entitlements_tenant_idx on public.entitlements (tenant_id);

-- --- Triggers updated_at ------------------------------------------------------
drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_tenants_updated_at on public.tenants;
create trigger set_tenants_updated_at before update on public.tenants
  for each row execute function public.set_updated_at();

drop trigger if exists set_subscriptions_updated_at on public.subscriptions;
create trigger set_subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

drop trigger if exists set_entitlements_updated_at on public.entitlements;
create trigger set_entitlements_updated_at before update on public.entitlements
  for each row execute function public.set_updated_at();

-- --- Alta automática de perfil al registrarse un usuario ----------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
