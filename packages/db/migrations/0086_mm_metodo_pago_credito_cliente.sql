-- =============================================================================
-- 0086 - Nuevo valor 'credito_cliente' en el enum public.mm_metodo_pago.
--
-- Pseudo-metodo de pago (igual naturaleza que 'fiado'): no es dinero real que
-- entra al negocio, es saldo a favor que el cliente ya tenia acumulado (de un
-- excedente acreditado en una venta anterior) y que usa para cubrir parte del
-- total de ESTA venta. Se guarda como fila en mm_pagos_venta igual que
-- cualquier otro metodo (mismo patron que fiado) para que el recibo y el
-- historial de la venta lo muestren igual que el resto de la forma de pago.
--
-- Deliberadamente NO se agrega a METODOS_PAGO_IDS/metodos-pago.ts: no es un
-- metodo que el negocio "active/desactive" en Configuracion como pago_movil o
-- zelle -- esta siempre disponible si el cliente tiene saldo, se selecciona
-- solo desde un boton dedicado en el POS ("Usar saldo a favor"), nunca desde
-- el selector generico de metodos.
-- =============================================================================

alter type public.mm_metodo_pago add value if not exists 'credito_cliente';

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0086_mm_metodo_pago_credito_cliente.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
