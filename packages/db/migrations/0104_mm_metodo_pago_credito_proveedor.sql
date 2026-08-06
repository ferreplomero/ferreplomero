-- =============================================================================
-- 0104 - Nuevo valor 'credito_proveedor' en el enum public.mm_metodo_pago.
--
-- Pseudo-metodo de pago (misma naturaleza que 'fiado'/'credito_cliente', ver
-- 0086): una compra que ya se recibio pero que el negocio AUN NO le ha pagado
-- al proveedor (factura a credito / cuenta por pagar real). No es dinero real
-- que sale del negocio -- se guarda en mm_compras.metodo_pago igual que
-- cualquier otro metodo para que el detalle de la compra lo muestre igual, y
-- se resuelve mas tarde con un pago real (ver mm_compras.pagada en
-- 0105_mm_compras_pago.sql y pagarCompra en compras/actions.ts).
--
-- Deliberadamente NO se agrega a METODOS_PAGO_IDS/metodos-pago.ts ni a
-- METODOS_GASTO_IDS: no es un metodo que el negocio "active/desactive" en
-- Configuracion, y un gasto/abono siempre implica dinero que YA salio -- solo
-- aplica a Compras, donde la mercancia puede recibirse antes de pagarla.
-- =============================================================================

alter type public.mm_metodo_pago add value if not exists 'credito_proveedor';

-- Registro en el historial de migraciones.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('0104_mm_metodo_pago_credito_proveedor.sql')
on conflict (version) do nothing;

NOTIFY pgrst, 'reload schema';
