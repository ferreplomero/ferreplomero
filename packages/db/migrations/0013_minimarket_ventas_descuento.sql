-- Agrega campo de descuento a la cabecera de ventas.
-- Esto permite registrar descuentos globales (por total de carrito)
-- sin cambiar la semántica de subtotal_usd ni los items individuales.
ALTER TABLE mm_ventas
  ADD COLUMN IF NOT EXISTS descuento_usd DECIMAL(12, 2) NOT NULL DEFAULT 0;
