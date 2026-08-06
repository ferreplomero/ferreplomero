import { IGTF_RATE, METODOS_BS, causaIgtf } from "@/lib/minimarket/constants";
import type { MmMetodoPago } from "@arkiteq/db";

/**
 * Cálculo puro del diálogo de cobro del POS. Sin React, sin estado: recibe las
 * filas de pago tal como están en la UI y devuelve los totales y, sobre todo,
 * `puedeConfirmar` — la verdad única que habilita el botón Confirmar.
 *
 * Reglas (alineadas con CLAUDE.md §12-14):
 *  - El fiado es una forma legítima de cubrir el total: cubierto = pagos + fiado.
 *  - El IGTF (3 %) aplica solo a la porción recibida en divisa física (efectivo
 *    USD, Zelle), nunca al fiado ni a Bs, y solo si igtfActivo=true.
 *  - El IVA aplica sobre el subtotal neto si ivaActivo=true.
 *  - El monto de la fila fiado, si el cajero no escribió nada, toma el restante.
 *  - Una venta puede confirmarse cuando los pagos + el fiado cubren el total y,
 *    si hay fiado, hay cliente y el monto fiado es real (> 0).
 */

/** Una fila de pago tal como vive en el estado del modal. */
export interface PagoCalcInput {
  metodo: MmMetodoPago;
  /** Texto crudo del input (puede traer coma decimal o estar vacío). */
  monto: string;
}

export interface CobroInput {
  pagos: PagoCalcInput[];
  /** Subtotal neto en USD (ya con descuento aplicado, sin impuestos). */
  subtotalNeto: number;
  /** Tasa Bs/USD vigente; null si no hay tasa definida. */
  tasa: number | null;
  /** Cantidad de líneas en el carrito (para validar venta no vacía). */
  cantidadLineas: number;
  /** Cliente seleccionado (""/null si no hay). */
  clienteId: string | null;
  /** Si el IGTF está activo en la config del negocio (default: true). */
  igtfActivo?: boolean;
  /** Si el IVA está activo en la config del negocio (default: false). */
  ivaActivo?: boolean;
  /** Porcentaje de IVA a aplicar sobre el subtotal cuando está activo (ej: 16). */
  ivaPct?: number;
  /** Subtotal neto (mismo criterio que `subtotalNeto`) pero SOLO de las
   * líneas gravadas (no exentas de IVA) — la base real sobre la que se
   * calcula `ivaUsd`. Si se omite, se asume igual a `subtotalNeto` (todo el
   * carrito gravado), el mismo resultado que daba esta función antes de
   * existir productos exentos. Ver `subtotalNetoGravado`. */
  subtotalGravado?: number;
  /** Saldo a favor disponible del cliente (excedente acreditado en una venta
   * anterior), en USD. Solo importa si hay una fila `credito_cliente`. */
  saldoFavorDisponible?: number;
}

export interface CobroResultado {
  igtf: number;
  /** IVA calculado sobre el subtotal neto (0 si ivaActivo=false). */
  ivaUsd: number;
  totalUsd: number;
  totalBs: number;
  /** Cubierto por pagos reales + fiado, en USD. */
  cubierto: number;
  /** Solo pagos reales (sin fiado), en USD. */
  cubiertoSinFiado: number;
  /** Monto que queda a crédito, en USD. */
  fiadoMonto: number;
  /** Lo que aún falta por cubrir, en USD (0 si está cubierto). */
  faltante: number;
  /** Vuelto a devolver, en USD (0 si no hay exceso). */
  vuelto: number;
  /**
   * Porción del vuelto que sale REALMENTE del efectivo en caja (Bs o USD
   * físicos), en USD. Distinto de `vuelto` cuando el exceso viene de un
   * método no-efectivo (pago móvil, Zelle, transferencia): ese sobrante no es
   * plata física que haya que devolver de la gaveta, así que no debe afectar
   * el arqueo de caja. Ver CLAUDE.md regla 13 y el módulo Caja.
   */
  vueltoEfectivoUsd: number;
  /** ¿Hay al menos una fila de tipo fiado? */
  hayFiado: boolean;
  /** Monto cubierto con saldo a favor del cliente, en USD (0 si no hay fila `credito_cliente`). */
  creditoMonto: number;
  /** ¿Hay al menos una fila de tipo credito_cliente? */
  hayCredito: boolean;
  /** Verdad única que habilita el botón Confirmar. */
  puedeConfirmar: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** ¿En qué moneda se ingresa el monto de este método? */
function esMonedaDivisa(metodo: MmMetodoPago): boolean {
  // efectivo_usd y zelle se ingresan en USD; el resto en Bs (fiado se trata aparte).
  return metodo === "efectivo_usd" || metodo === "zelle";
}

/** ¿Este método mueve efectivo físico de la gaveta (billetes reales)? */
export function esEfectivo(metodo: MmMetodoPago): boolean {
  return metodo === "efectivo_bs" || metodo === "efectivo_usd";
}

/** ¿Esta línea NO paga IVA? (el producto tiene `impuesto_id = "exento"`). */
export function esLineaExenta(impuestoId: string | null | undefined): boolean {
  return impuestoId === "exento";
}

export interface LineaGravableInput {
  /** Total bruto de la línea (precio unitario × cantidad, ya redondeado). */
  totalUsd: number;
  impuestoId: string | null | undefined;
}

/**
 * Subtotal neto (con el descuento ya aplicado) de SOLO las líneas gravadas
 * de un carrito — la base real sobre la que debe calcularse el IVA cuando
 * la venta mezcla productos exentos y gravados (CLAUDE.md: un producto
 * exento nunca debe pagar impuesto). El descuento del carrito se reparte
 * proporcionalmente entre lo gravado y lo exento según su peso en el
 * subtotal bruto, para que ambas partes sigan sumando exactamente el mismo
 * subtotal neto total que ya se cobraba. Si no hay líneas exentas, el
 * resultado es idéntico al subtotal neto completo del carrito — el mismo
 * cálculo de siempre para una venta 100% gravada.
 */
export function subtotalNetoGravado(lineas: LineaGravableInput[], descuentoUsd: number): number {
  const subtotalBruto = lineas.reduce((s, l) => s + l.totalUsd, 0);
  if (subtotalBruto <= 0) return 0;
  const brutoGravado = lineas
    .filter((l) => !esLineaExenta(l.impuestoId))
    .reduce((s, l) => s + l.totalUsd, 0);
  const descuentoGravado = descuentoUsd * (brutoGravado / subtotalBruto);
  return Math.max(0, round2(brutoGravado - descuentoGravado));
}

/** Tolerancia de redondeo: por debajo de esto, el total se considera cubierto. */
export const TOLERANCIA_USD = 0.02;

export function computeCobro(input: CobroInput): CobroResultado {
  const {
    pagos,
    subtotalNeto,
    tasa,
    cantidadLineas,
    clienteId,
    igtfActivo = true,
    ivaActivo = false,
    ivaPct = 0,
    subtotalGravado = subtotalNeto,
    saldoFavorDisponible = 0,
  } = input;

  const hayFiado = pagos.some((p) => p.metodo === "fiado");
  const hayCredito = pagos.some((p) => p.metodo === "credito_cliente");

  const ivaUsd = ivaActivo && ivaPct > 0 ? round2((subtotalGravado * ivaPct) / 100) : 0;

  if (!tasa) {
    return {
      igtf: 0,
      ivaUsd,
      totalUsd: round2(subtotalNeto + ivaUsd),
      totalBs: 0,
      cubierto: 0,
      cubiertoSinFiado: 0,
      fiadoMonto: 0,
      faltante: round2(subtotalNeto + ivaUsd),
      vuelto: 0,
      vueltoEfectivoUsd: 0,
      hayFiado,
      creditoMonto: 0,
      hayCredito,
      puedeConfirmar: false,
    };
  }

  let igtf = 0;
  let cubiertoSinFiado = 0;
  let montoEfectivoUsd = 0;
  let montoNoEfectivoUsd = 0;

  for (const pago of pagos) {
    if (pago.metodo === "fiado" || pago.metodo === "credito_cliente") continue;
    const num = parseFloat(pago.monto.replace(",", "."));
    if (!Number.isFinite(num) || num <= 0) continue;
    const usd = esMonedaDivisa(pago.metodo) ? num : num / tasa;
    cubiertoSinFiado += usd;
    if (esEfectivo(pago.metodo)) montoEfectivoUsd += usd;
    else montoNoEfectivoUsd += usd;
    if (igtfActivo && causaIgtf(pago.metodo)) igtf += usd * IGTF_RATE;
  }

  igtf = round2(igtf);
  const totalUsd = round2(subtotalNeto + igtf + ivaUsd);
  const totalBs = round2(totalUsd * tasa);

  // Monto cubierto con saldo a favor del cliente — a diferencia de fiado, NO
  // se auto-completa si la fila queda en blanco: siempre es un monto
  // explícito (el cajero lo agrega con el botón "Usar saldo a favor", que ya
  // lo pre-llena con el mínimo entre lo disponible y lo que falta).
  let creditoMonto = 0;
  if (hayCredito) {
    const creditoPago = pagos.find((p) => p.metodo === "credito_cliente");
    const creditoNum = parseFloat((creditoPago?.monto ?? "").replace(",", "."));
    creditoMonto = Number.isFinite(creditoNum) && creditoNum > 0 ? round2(creditoNum) : 0;
  }

  // El restante que quedaría a crédito tras los pagos reales y el saldo a favor.
  const restante = Math.max(0, round2(totalUsd - cubiertoSinFiado - creditoMonto));

  let fiadoMonto = 0;
  if (hayFiado) {
    const fiadoPago = pagos.find((p) => p.metodo === "fiado");
    const fiadoNum = parseFloat((fiadoPago?.monto ?? "").replace(",", "."));
    // Monto explícito (en USD) si el cajero lo escribió; si no, toma el restante.
    fiadoMonto = Number.isFinite(fiadoNum) && fiadoNum > 0 ? round2(fiadoNum) : restante;
  }

  const cubierto = round2(cubiertoSinFiado + fiadoMonto + creditoMonto);
  const faltante = Math.max(0, round2(totalUsd - cubierto));
  const vuelto = Math.max(0, round2(cubierto - totalUsd));

  // Lo que de verdad necesita salir de la gaveta: el total menos lo que ya
  // cubrieron los métodos no-efectivo, el fiado y el saldo a favor. Cualquier
  // efectivo por encima de eso es vuelto REAL (billetes que hay que
  // devolver) — a diferencia de `vuelto`, que mezcla cualquier método y no
  // distingue si el sobrante es plata física o un excedente en pago
  // móvil/Zelle/transferencia.
  const necesarioDeEfectivo = Math.max(
    0,
    round2(totalUsd - montoNoEfectivoUsd - fiadoMonto - creditoMonto),
  );
  const vueltoEfectivoUsd = Math.max(0, round2(montoEfectivoUsd - necesarioDeEfectivo));

  // Verdad única del botón Confirmar.
  const totalCubierto = faltante <= TOLERANCIA_USD;
  const fiadoValido = !hayFiado || (!!clienteId && fiadoMonto > 0.001);
  const creditoValido =
    !hayCredito ||
    (!!clienteId && creditoMonto > 0.001 && creditoMonto <= saldoFavorDisponible + 0.001);
  const puedeConfirmar = cantidadLineas > 0 && totalCubierto && fiadoValido && creditoValido;

  return {
    igtf,
    ivaUsd,
    totalUsd,
    totalBs,
    cubierto,
    cubiertoSinFiado: round2(cubiertoSinFiado),
    fiadoMonto,
    faltante,
    vuelto,
    vueltoEfectivoUsd,
    hayFiado,
    creditoMonto,
    hayCredito,
    puedeConfirmar,
  };
}

/**
 * Excedente (vuelto) expresado en Bs con precisión exacta — a diferencia de
 * convertir `computeCobro().vuelto` (ya redondeado a centavos en USD) de
 * vuelta a Bs multiplicándolo por la tasa, esto suma cada pago en su moneda
 * nativa y resta el total en Bs una sola vez. Evita el arrastre de unos
 * centavos que aparece cuando el pago que generó el excedente ya era nativo
 * en Bs (doble redondeo Bs→USD→Bs). Solo se usa para construir el monto que
 * de verdad sale de caja/banco — el `vuelto` en USD de `computeCobro` sigue
 * siendo la única fuente de verdad para decidir SI hay excedente y para lo
 * que se muestra en pantalla.
 */
export function calcularExcedenteBs(
  pagos: PagoCalcInput[],
  tasa: number,
  totalBs: number,
  fiadoMonto = 0,
  creditoMonto = 0,
): number {
  let sumBs = round2(fiadoMonto * tasa) + round2(creditoMonto * tasa);
  for (const p of pagos) {
    if (p.metodo === "fiado" || p.metodo === "credito_cliente") continue;
    const num = parseFloat(p.monto.replace(",", "."));
    if (!Number.isFinite(num) || num <= 0) continue;
    sumBs += esMonedaDivisa(p.metodo) ? num * tasa : num;
  }
  return Math.max(0, round2(sumBs - totalBs));
}

/** Una fila de pago que además recuerda si su monto lo puso el sistema para
 * cubrir el saldo (botón "← saldo" o el pre-llenado inicial del diálogo de
 * cobro), en vez de un monto físico que el cajero tecleó a mano. */
export interface PagoRowConSaldo extends PagoCalcInput {
  key: string;
  autoSaldo?: boolean;
}

/**
 * Menor monto (a centavos) tal que, pagándolo con un método que causa IGTF,
 * el total resultante (`faltanteBase` + IGTF sobre ESE monto, ambos
 * redondeados a centavos exactamente como en `computeCobro`) queda cubierto
 * por el propio monto — sin vuelto fantasma.
 *
 * `Math.ceil(faltanteBase / (1 - IGTF_RATE))` por sí solo NO garantiza esto:
 * ese cálculo asume que el 3 % de IGTF se resta sin redondear, pero
 * `computeCobro` SÍ redondea el IGTF a centavos antes de sumarlo al total —
 * ese redondeo puede dejar el total real un centavo por DEBAJO del monto
 * sugerido (ej.: faltante $3.33 → la fórmula sin ajustar sugiere $3.44, pero
 * al pagar $3.44 el total recalculado da $3.43, dejando 1 centavo de vuelto
 * que no debería existir). Se arranca de un piso (floor, nunca por encima de
 * la solución real) y se sube de a un centavo hasta que el total
 * recalculado con ESE monto quede cubierto — así queda garantizado que
 * coincide exactamente con lo que `computeCobro` va a mostrar.
 */
function montoMinimoQueCubreConIgtf(faltanteBase: number): number {
  let candidato = Math.floor((faltanteBase / (1 - IGTF_RATE)) * 100) / 100;
  if (candidato < faltanteBase) candidato = round2(faltanteBase);
  for (let i = 0; i < 10; i++) {
    const totalConCandidato = round2(faltanteBase + round2(candidato * IGTF_RATE));
    if (totalConCandidato <= candidato) return candidato;
    candidato = round2(candidato + 0.01);
  }
  return candidato;
}

/**
 * Calcula el monto (en la moneda del método `key`) que cubre exactamente el
 * saldo pendiente, dadas las demás filas de pago tal cual están. Es la misma
 * cuenta que hace el botón "← saldo"; se expone aparte para poder reusarla al
 * reaccionar a un cambio de tasa (ver `recalcularPagosPorTasa`).
 *
 * `igtfActivo` debe venir de la config del negocio — igual que en
 * `computeCobro` — para que el monto sugerido nunca incluya el ajuste de
 * IGTF cuando el negocio lo tiene desactivado.
 */
export function calcularMontoSaldo(
  pagos: PagoRowConSaldo[],
  key: string,
  subtotalNeto: number,
  tasa: number,
  igtfActivo: boolean,
  ivaActivo: boolean,
  ivaPct: number,
  saldoFavorDisponible = 0,
  // Base gravada real (ver `subtotalNetoGravado`) — default = subtotalNeto
  // (todo gravado), mismo resultado que antes de existir productos exentos.
  subtotalGravado: number = subtotalNeto,
): string | null {
  const pagoActual = pagos.find((p) => p.key === key);
  if (!pagoActual) return null;

  let igtfOtros = 0;
  let cubiertoOtros = 0;
  for (const p of pagos) {
    if (p.key === key) continue;
    if (p.metodo === "fiado" || p.metodo === "credito_cliente") {
      const num = parseFloat((p.monto ?? "").replace(",", "."));
      if (Number.isFinite(num) && num > 0) cubiertoOtros += num;
      continue;
    }
    const num = parseFloat(p.monto.replace(",", "."));
    if (!Number.isFinite(num) || num <= 0) continue;
    const usd = esMonedaDivisa(p.metodo) ? num : num / tasa;
    cubiertoOtros += usd;
    if (igtfActivo && causaIgtf(p.metodo)) igtfOtros += usd * IGTF_RATE;
  }
  igtfOtros = round2(igtfOtros);

  const ivaTotal = ivaActivo && ivaPct > 0 ? round2((subtotalGravado * ivaPct) / 100) : 0;
  const faltanteBase = Math.max(0, subtotalNeto + ivaTotal + igtfOtros - cubiertoOtros);
  if (faltanteBase <= 0) return "0.00";

  // El saldo a favor nunca sugiere más de lo que el cliente realmente tiene
  // disponible — a diferencia de fiado, que sí puede cubrir cualquier resto.
  if (pagoActual.metodo === "credito_cliente") {
    return Math.max(0, Math.min(faltanteBase, saldoFavorDisponible)).toFixed(2);
  }
  if (pagoActual.metodo === "fiado") return faltanteBase.toFixed(2);

  const esDivisa = esMonedaDivisa(pagoActual.metodo);
  if (igtfActivo && causaIgtf(pagoActual.metodo)) {
    const pUsd = montoMinimoQueCubreConIgtf(faltanteBase);
    return esDivisa ? pUsd.toFixed(2) : (Math.ceil(pUsd * tasa * 100) / 100).toFixed(2);
  }
  return esDivisa
    ? (Math.ceil(faltanteBase * 100) / 100).toFixed(2)
    : (Math.ceil(faltanteBase * tasa * 100) / 100).toFixed(2);
}

/**
 * Al cambiar la tasa de cobro, las filas en Bs cuyo monto representaba "el
 * saldo" (autoSaldo=true) deben recalcularse al nuevo total en Bs para seguir
 * cubriéndolo — si no, quedan descuadradas con la tasa vieja. Las filas con un
 * monto físico tecleado a mano (autoSaldo=false/undefined) y los montos en USD
 * (efectivo_usd, Zelle) NO se tocan.
 */
export function recalcularPagosPorTasa<T extends PagoRowConSaldo>(
  pagos: T[],
  subtotalNeto: number,
  tasaNueva: number,
  igtfActivo: boolean,
  ivaActivo: boolean,
  ivaPct: number,
  // Base gravada real (ver `subtotalNetoGravado`) — default = subtotalNeto.
  subtotalGravado: number = subtotalNeto,
): T[] {
  const aRecalcular = pagos.filter((p) => p.autoSaldo && METODOS_BS.includes(p.metodo));
  if (aRecalcular.length === 0) return pagos;

  let resultado = pagos;
  for (const fila of aRecalcular) {
    const sugerido = calcularMontoSaldo(
      resultado,
      fila.key,
      subtotalNeto,
      tasaNueva,
      igtfActivo,
      ivaActivo,
      ivaPct,
      undefined,
      subtotalGravado,
    );
    if (sugerido === null) continue;
    resultado = resultado.map((p) => (p.key === fila.key ? { ...p, monto: sugerido } : p));
  }
  return resultado;
}
