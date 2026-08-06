-- =============================================================================
-- 0029 · Onboarding guiado del vertical Minimarket (tour de Arki)
--
-- Registra si un usuario, dentro de un negocio (tenant), ya vio/descartó el
-- tour de bienvenida de Minimarket, para no repetirlo en cada ingreso NI
-- depender de localStorage (debe respetarse aunque entre desde otro
-- dispositivo — CLAUDE.md regla 17, el estado se valida en servidor).
-- Vive en `memberships` porque el tour es exactamente por (usuario, negocio),
-- que es lo que esa tabla ya modela — no hace falta una tabla nueva.
-- =============================================================================

alter table public.memberships
  add column if not exists onboarding_minimarket_completado_en timestamptz;

-- Marca (o reinicia) el PROPIO tour de Minimarket del usuario autenticado en
-- un tenant al que pertenece. No se expone como policy de UPDATE normal
-- porque "memberships_manage" (0003_rls_policies.sql) restringe la escritura
-- de esa tabla a propietario/administrador — un cajero o almacén también debe
-- poder descartar o completar su propio tour. SECURITY DEFINER acota la
-- escritura a `profile_id = auth.uid()`, igual patrón que `auth_tenant_ids()`.
create or replace function public.set_onboarding_minimarket(p_tenant_id uuid, p_completado boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.memberships
  set onboarding_minimarket_completado_en = case when p_completado then now() else null end
  where tenant_id = p_tenant_id and profile_id = auth.uid();
$$;

grant execute on function public.set_onboarding_minimarket(uuid, boolean) to authenticated;
