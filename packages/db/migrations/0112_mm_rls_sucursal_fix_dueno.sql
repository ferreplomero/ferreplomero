-- =============================================================================
-- 0112 · Corrige auth_sucursal_ids(): el dueño/administrador de una cuenta
-- recién creada quedaba SIN sucursales
--
-- Bug real reproducido: una cuenta nueva (propietario en `memberships`,
-- `tenants.created_by` = ella misma) que crea sucursales desde Configuración
-- SIN pasar antes por el asistente de bienvenida (`/minimarket/bienvenida`,
-- que es opcional) nunca llega a tener fila en `mm_usuarios_sucursal` — esa
-- tabla la llena `aprovisionarMinimarketInicial`, que solo corre al terminar
-- ese asistente. La función 0111 basaba el bypass de dueño/administrador
-- ÚNICAMENTE en encontrar una fila con rol operativo 'dueno'/'administrador'
-- en `mm_usuarios_sucursal` — sin esa fila, caía al caso "sin asignación" y
-- devolvía cero sucursales, incluso siendo el propio dueño.
--
-- Corrección: usar como señal de bypass el rol de PLATAFORMA
-- (`memberships.role in ('propietario','administrador')`, vía el helper
-- `auth_has_tenant_role()` ya existente desde 0003) — se crea de forma
-- atómica en el registro (`asegurarNegocioInicial`), nunca depende de que el
-- asistente de bienvenida haya corrido. Se mantiene también el chequeo por
-- rol operativo (`mm_usuarios_sucursal` con slug 'dueno'/'administrador')
-- para el caso de un miembro de personal promovido a administrador operativo
-- sin rol de plataforma.
-- =============================================================================

create or replace function public.auth_sucursal_ids(target_tenant uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from public.mm_sucursales s
  where s.tenant_id = target_tenant
    and s.deleted_at is null
    and (
      public.auth_has_tenant_role(
        target_tenant, array['propietario', 'administrador']::public.membership_role[]
      )
      or exists (
        select 1
        from public.mm_usuarios_sucursal u
        join public.mm_roles r on r.id = u.rol_id
        where u.tenant_id = target_tenant
          and u.profile_id = auth.uid()
          and u.activo
          and u.deleted_at is null
          and r.slug in ('dueno', 'administrador')
      )
    )
  union
  select u.sucursal_id
  from public.mm_usuarios_sucursal u
  where u.tenant_id = target_tenant
    and u.profile_id = auth.uid()
    and u.activo
    and u.deleted_at is null;
$$;
