-- =============================================================================
-- 0125 - Reparacion de datos (comentarios en ASCII plano a proposito).
--
-- La anulacion de compras recibidas (commit b18ad21) guardo sus salidas de
-- inventario con cantidad POSITIVA. mm_v_stock suma `cantidad` tal cual (es un
-- delta con signo: salida negativa), asi que esas salidas SUMARON stock en vez
-- de restarlo. Aqui se les invierte el signo. Solo toca salidas de anulacion
-- de compras ya anuladas que quedaron en positivo: correr dos veces no hace
-- nada la segunda vez.
-- =============================================================================

update public.mm_movimientos_inventario m
set cantidad = -m.cantidad
where m.tipo = 'salida'
  and m.cantidad > 0
  and m.motivo like 'Anulaci_n de compra'
  and m.referencia in (
    select c.id from public.mm_compras c where c.estado = 'anulada'
  );
