-- =============================================================================
-- 0021 · Tres tasas de cambio en paralelo (BCV / EURO / Personalizada)
--
-- Hasta ahora `mm_tasas_cambio` era un único stream (auto/manual) sin forma de
-- distinguir de qué fuente venía un valor "auto" (BCV vs Euro). Se agrega la
-- columna `tipo`, que identifica cuál de las 3 tasas es cada fila; cada tipo
-- mantiene su propio último valor vigente en paralelo. `fuente_tasa` en
-- mm_config_negocio pasa a significar "tipo preseleccionado" (afecta todo el
-- sistema por defecto); el mismo dominio de valores ('bcv','euro','manual').
-- =============================================================================

alter table public.mm_tasas_cambio
  add column if not exists tipo text not null default 'bcv'
    check (tipo in ('bcv', 'euro', 'manual'));

-- Backfill: las filas 'auto' ya quedan en 'bcv' por el default (única fuente
-- auto que existía antes de esta migración); las 'manual' se marcan como tal.
update public.mm_tasas_cambio set tipo = 'manual' where fuente = 'manual' and tipo <> 'manual';

create index if not exists mm_tasas_cambio_tipo_idx
  on public.mm_tasas_cambio (tenant_id, tipo, created_at desc);
