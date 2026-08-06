-- =============================================================================
-- 0005 · Tipos enumerados del vertical Minimarket (POS / bodega / abasto)
-- Prefijo `mm_` para aislar el vertical dentro del esquema public sin colisiones.
-- Idempotente: el patrón do/exception permite reaplicar sin error.
-- =============================================================================

-- Rol operativo dentro de una sucursal (distinto del rol de plataforma).
do $$ begin
  create type public.mm_rol_operativo as enum ('dueno', 'cajero', 'almacen');
exception when duplicate_object then null; end $$;

-- Tipo de movimiento en el ledger de inventario (append-only).
do $$ begin
  create type public.mm_mov_tipo as enum ('entrada', 'salida', 'ajuste', 'merma');
exception when duplicate_object then null; end $$;

-- Estado de una compra a proveedor.
do $$ begin
  create type public.mm_compra_estado as enum ('borrador', 'recibida', 'anulada');
exception when duplicate_object then null; end $$;

-- Tipo de documento de venta: recibo simple (hoy) o factura fiscal (futuro SENIAT).
do $$ begin
  create type public.mm_doc_tipo as enum ('recibo', 'fiscal');
exception when duplicate_object then null; end $$;

-- Estado de una venta.
do $$ begin
  create type public.mm_venta_estado as enum ('completada', 'anulada');
exception when duplicate_object then null; end $$;

-- Métodos de pago (soporta pago mixto: varias filas por venta).
do $$ begin
  create type public.mm_metodo_pago as enum (
    'efectivo_bs', 'efectivo_usd', 'pago_movil', 'transferencia', 'tarjeta', 'fiado'
  );
exception when duplicate_object then null; end $$;

-- Estado de una sesión de caja.
do $$ begin
  create type public.mm_caja_estado as enum ('abierta', 'cerrada');
exception when duplicate_object then null; end $$;

-- Tipo de movimiento de caja (append-only).
do $$ begin
  create type public.mm_caja_mov_tipo as enum ('ingreso', 'egreso', 'retiro', 'venta');
exception when duplicate_object then null; end $$;

-- Origen de una tasa de cambio registrada.
do $$ begin
  create type public.mm_tasa_fuente as enum ('auto', 'manual');
exception when duplicate_object then null; end $$;

-- Estado de una cuenta por cobrar (fiado).
do $$ begin
  create type public.mm_fiado_estado as enum ('abierto', 'pagado', 'anulado');
exception when duplicate_object then null; end $$;
