-- =============================================================================
-- 0003 · Row-Level Security en TODAS las tablas
-- Aislamiento real por inquilino: un tenant jamás ve datos de otro.
-- El catálogo (products/plans) es lectura pública; las tablas operativas se
-- filtran por los tenants a los que pertenece el usuario autenticado.
-- service_role salta RLS (solo se usa en el servidor).
-- =============================================================================

-- Devuelve los tenants del usuario autenticado. SECURITY DEFINER para leer
-- memberships sin recursión de políticas.
create or replace function public.auth_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.memberships where profile_id = auth.uid();
$$;

-- Comprueba si el usuario tiene un rol de gestión (propietario/administrador).
create or replace function public.auth_has_tenant_role(target uuid, roles public.membership_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where tenant_id = target and profile_id = auth.uid() and role = any (roles)
  );
$$;

-- Activar RLS -----------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.tenants       enable row level security;
alter table public.memberships   enable row level security;
alter table public.products      enable row level security;
alter table public.plans         enable row level security;
alter table public.subscriptions enable row level security;
alter table public.entitlements  enable row level security;

-- profiles --------------------------------------------------------------------
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.memberships m
      where m.profile_id = public.profiles.id
        and m.tenant_id in (select public.auth_tenant_ids())
    )
  );

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- tenants ---------------------------------------------------------------------
drop policy if exists "tenants_select" on public.tenants;
create policy "tenants_select" on public.tenants for select to authenticated
  using (id in (select public.auth_tenant_ids()));

drop policy if exists "tenants_insert" on public.tenants;
create policy "tenants_insert" on public.tenants for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists "tenants_update" on public.tenants;
create policy "tenants_update" on public.tenants for update to authenticated
  using (public.auth_has_tenant_role(id, array['propietario', 'administrador']::public.membership_role[]))
  with check (public.auth_has_tenant_role(id, array['propietario', 'administrador']::public.membership_role[]));

-- memberships -----------------------------------------------------------------
drop policy if exists "memberships_select" on public.memberships;
create policy "memberships_select" on public.memberships for select to authenticated
  using (tenant_id in (select public.auth_tenant_ids()));

-- Permite al creador del tenant registrar su propia membresía inicial.
drop policy if exists "memberships_insert_self" on public.memberships;
create policy "memberships_insert_self" on public.memberships for insert to authenticated
  with check (profile_id = auth.uid());

drop policy if exists "memberships_manage" on public.memberships;
create policy "memberships_manage" on public.memberships for all to authenticated
  using (public.auth_has_tenant_role(tenant_id, array['propietario', 'administrador']::public.membership_role[]))
  with check (public.auth_has_tenant_role(tenant_id, array['propietario', 'administrador']::public.membership_role[]));

-- products (catálogo público de lectura) --------------------------------------
drop policy if exists "products_select_all" on public.products;
create policy "products_select_all" on public.products for select
  using (true);

-- plans (catálogo público de lectura) -----------------------------------------
drop policy if exists "plans_select_all" on public.plans;
create policy "plans_select_all" on public.plans for select
  using (true);

-- subscriptions (solo lectura para el tenant; escritura vía service_role) ------
drop policy if exists "subscriptions_select" on public.subscriptions;
create policy "subscriptions_select" on public.subscriptions for select to authenticated
  using (tenant_id in (select public.auth_tenant_ids()));

-- entitlements (FUENTE DE VERDAD; lectura por tenant, nunca escritura de usuario)
drop policy if exists "entitlements_select" on public.entitlements;
create policy "entitlements_select" on public.entitlements for select to authenticated
  using (tenant_id in (select public.auth_tenant_ids()));
