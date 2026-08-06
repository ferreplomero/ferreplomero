-- =============================================================================
-- 0031 · Tasa de cambio de PLATAFORMA (panel admin)
--
-- Igual patrón que `mm_tasas_cambio` del minimarket (append-only, varias
-- "tasas" en paralelo, cada una con su último valor vigente) pero A NIVEL DE
-- PLATAFORMA: no tiene tenant_id porque no pertenece a ningún negocio — sirve
-- de referencia para sembrar la tasa inicial de un tenant nuevo (ver
-- lib/minimarket/onboarding.ts) cuando el propio negocio aún no tiene una.
--
-- Dos tasas en paralelo: 'bcv' (automática, se sincroniza con el BCV) y
-- 'manual' (el admin la escribe a mano). SOLO 2 decimales (a diferencia de
-- `mm_tasas_cambio`, que guarda 6): esto es para precios comerciales, no para
-- el POS.
-- =============================================================================

create table if not exists public.platform_tasas_cambio (
  id          uuid primary key default gen_random_uuid(),
  valor       numeric(18, 2) not null check (valor > 0),
  fuente      text not null check (fuente in ('auto', 'manual')),
  tipo        text not null check (tipo in ('bcv', 'manual')),
  usuario_id  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists platform_tasas_cambio_tipo_idx
  on public.platform_tasas_cambio (tipo, created_at desc);

alter table public.platform_tasas_cambio enable row level security;

-- Lectura: cualquier usuario autenticado.
drop policy if exists "platform_tasas_cambio_select" on public.platform_tasas_cambio;
create policy "platform_tasas_cambio_select" on public.platform_tasas_cambio
  for select to authenticated using (true);

-- Sin políticas de insert/update/delete para `authenticated`: solo el panel
-- admin (con `service_role`) escribe.
