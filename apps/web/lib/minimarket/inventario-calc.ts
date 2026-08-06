export type TipoMovimientoInventario = "entrada" | "salida" | "ajuste" | "merma";

/**
 * Signo del movimiento según el tipo, para el ledger append-only
 * `mm_movimientos_inventario`. El ajuste conserva el signo ingresado
 * (permite tanto sumar como restar); entrada siempre suma, salida/merma
 * siempre restan.
 */
export function deltaConSigno(tipo: TipoMovimientoInventario, cantidad: number): number {
  switch (tipo) {
    case "entrada":
      return Math.abs(cantidad);
    case "salida":
    case "merma":
      return -Math.abs(cantidad);
    case "ajuste":
      return cantidad;
  }
}
