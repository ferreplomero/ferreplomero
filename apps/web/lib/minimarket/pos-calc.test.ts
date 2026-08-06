import { describe, expect, it } from "vitest";
import {
  calcularExcedenteBs,
  calcularMontoSaldo,
  computeCobro,
  recalcularPagosPorTasa,
  subtotalNetoGravado,
} from "./pos-calc";

// Tasa de referencia para los casos: 623.02 Bs/USD (ejemplo real del usuario).
const TASA = 623.02;

describe("computeCobro — caso del usuario: pago parcial + fiar el resto", () => {
  // Total $1.50 → 934.53 Bs. El cliente paga 500 Bs en tarjeta y fía el resto.
  it("habilita Confirmar cuando tarjeta cubre parte y fiado el resto (con cliente)", () => {
    const r = computeCobro({
      pagos: [
        { metodo: "tarjeta", monto: "500" }, // 500/623.02 ≈ $0.8025
        { metodo: "fiado", monto: "" }, // auto = restante
      ],
      subtotalNeto: 1.5,
      tasa: TASA,
      cantidadLineas: 2,
      clienteId: "cliente-jeramine",
    });

    expect(r.totalUsd).toBe(1.5);
    expect(r.cubiertoSinFiado).toBeCloseTo(0.8, 2);
    expect(r.fiadoMonto).toBeCloseTo(0.7, 2); // el resto queda a crédito
    expect(r.faltante).toBe(0);
    expect(r.puedeConfirmar).toBe(true);
  });

  it("BLOQUEA si hay fiado pero NO hay cliente seleccionado", () => {
    const r = computeCobro({
      pagos: [
        { metodo: "tarjeta", monto: "500" },
        { metodo: "fiado", monto: "" },
      ],
      subtotalNeto: 1.5,
      tasa: TASA,
      cantidadLineas: 2,
      clienteId: null,
    });

    expect(r.faltante).toBe(0); // el fiado absorbe el restante…
    expect(r.puedeConfirmar).toBe(false); // …pero sin cliente no se puede confirmar
  });
});

describe("computeCobro — flujo 'Dejar el resto a fiado' (botón de un toque)", () => {
  // Equivale a: efectivo_bs 500 + el botón agrega una fila fiado vacía.
  // El restante se auto-absorbe en el fiado sin que el cajero escriba el monto.
  it("pago 500 Bs + dejar resto fiado → fiadoMonto = restante y confirma", () => {
    const r = computeCobro({
      pagos: [
        { metodo: "efectivo_bs", monto: "500" }, // $0.80 @625
        { metodo: "fiado", monto: "" }, // lo que agrega dejarRestoFiado()
      ],
      subtotalNeto: 1.6,
      tasa: 625,
      cantidadLineas: 1,
      clienteId: "cliente-con-credito",
    });
    expect(r.cubiertoSinFiado).toBeCloseTo(0.8, 2);
    expect(r.fiadoMonto).toBeCloseTo(0.8, 2);
    expect(r.faltante).toBe(0);
    expect(r.puedeConfirmar).toBe(true);
  });
});

describe("computeCobro — venta de 1000 Bs, 500 pagado + 500 fiado", () => {
  // Total exacto 1000 Bs con tasa 625 → $1.60. Paga 500 Bs, fía 500 Bs ($0.80).
  it("crea fiado por el monto correcto y habilita Confirmar", () => {
    const r = computeCobro({
      pagos: [
        { metodo: "efectivo_bs", monto: "500" }, // $0.80
        { metodo: "fiado", monto: "" }, // auto = $0.80
      ],
      subtotalNeto: 1.6,
      tasa: 625,
      cantidadLineas: 1,
      clienteId: "cliente-x",
    });

    expect(r.totalUsd).toBe(1.6);
    expect(r.cubiertoSinFiado).toBeCloseTo(0.8, 2);
    expect(r.fiadoMonto).toBeCloseTo(0.8, 2);
    expect(r.faltante).toBe(0);
    expect(r.puedeConfirmar).toBe(true);
  });
});

describe("computeCobro — modalidades que ya funcionaban (no romper)", () => {
  it("A) pago único efectivo Bs completo", () => {
    const r = computeCobro({
      pagos: [{ metodo: "efectivo_bs", monto: "1000" }], // $1.60 @625
      subtotalNeto: 1.6,
      tasa: 625,
      cantidadLineas: 1,
      clienteId: null,
    });
    expect(r.faltante).toBe(0);
    expect(r.hayFiado).toBe(false);
    expect(r.puedeConfirmar).toBe(true);
  });

  it("B) pago mixto sin fiado (efectivo + pago móvil)", () => {
    const r = computeCobro({
      pagos: [
        { metodo: "efectivo_bs", monto: "300" },
        { metodo: "pago_movil", monto: "700" },
      ],
      subtotalNeto: 1.6,
      tasa: 625,
      cantidadLineas: 1,
      clienteId: null,
    });
    expect(r.cubiertoSinFiado).toBeCloseTo(1.6, 2);
    expect(r.faltante).toBe(0);
    expect(r.puedeConfirmar).toBe(true);
  });

  it("C) venta totalmente fiada con cliente", () => {
    const r = computeCobro({
      pagos: [{ metodo: "fiado", monto: "" }],
      subtotalNeto: 1.6,
      tasa: 625,
      cantidadLineas: 1,
      clienteId: "cliente-x",
    });
    expect(r.fiadoMonto).toBeCloseTo(1.6, 2);
    expect(r.faltante).toBe(0);
    expect(r.puedeConfirmar).toBe(true);
  });

  it("D) IGTF: efectivo USD aplica 3 % sobre la porción en divisa", () => {
    const r = computeCobro({
      pagos: [{ metodo: "efectivo_usd", monto: "1.6" }],
      subtotalNeto: 1.6,
      tasa: 625,
      cantidadLineas: 1,
      clienteId: null,
    });
    expect(r.igtf).toBeCloseTo(0.05, 2); // 1.6 * 0.03 = 0.048 → 0.05
    expect(r.totalUsd).toBeCloseTo(1.65, 2);
  });
});

describe("computeCobro — elimina el 'fiado fantasma'", () => {
  it("BLOQUEA si el efectivo ya cubre todo y la fila fiado quedaría en $0", () => {
    const r = computeCobro({
      pagos: [
        { metodo: "efectivo_bs", monto: "1000" }, // $1.60, cubre todo
        { metodo: "fiado", monto: "" }, // restante = 0 → fiadoMonto 0
      ],
      subtotalNeto: 1.6,
      tasa: 625,
      cantidadLineas: 1,
      clienteId: "cliente-x",
    });
    expect(r.fiadoMonto).toBe(0);
    expect(r.faltante).toBe(0);
    // No se permite confirmar un fiado de $0: el cajero debe quitar la fila fiado
    // o reducir el efectivo si de verdad quiere fiar.
    expect(r.puedeConfirmar).toBe(false);
  });
});

describe("computeCobro — vuelto en efectivo (caja)", () => {
  // Caso del usuario: venta de $50, paga con billete de $100 en efectivo.
  // igtfActivo:false aquí para aislar la lógica de vuelto en efectivo del IGTF
  // (ver el describe "IGTF sobre el monto entregado" más abajo — es un caso
  // aparte, ya reportado, pendiente de decisión).
  it("venta $50 pagada con $100 efectivo USD → vuelto en efectivo de $50", () => {
    const r = computeCobro({
      pagos: [{ metodo: "efectivo_usd", monto: "100" }],
      subtotalNeto: 50,
      tasa: 100,
      cantidadLineas: 1,
      clienteId: null,
      igtfActivo: false,
    });
    expect(r.totalUsd).toBe(50);
    expect(r.vuelto).toBeCloseTo(50, 2);
    expect(r.vueltoEfectivoUsd).toBeCloseTo(50, 2);
  });

  it("pago exacto en efectivo → sin vuelto", () => {
    const r = computeCobro({
      pagos: [{ metodo: "efectivo_bs", monto: "5000" }],
      subtotalNeto: 8,
      tasa: 625,
      cantidadLineas: 1,
      clienteId: null,
    });
    expect(r.vueltoEfectivoUsd).toBe(0);
  });

  it("el sobrante en un método NO efectivo (pago móvil) no genera vuelto de caja", () => {
    // El cajero escribió de más en pago móvil por error: es un excedente
    // digital, no plata física que haya que devolver de la gaveta.
    const r = computeCobro({
      pagos: [{ metodo: "pago_movil", monto: "6250" }], // $10 @625, total es $8
      subtotalNeto: 8,
      tasa: 625,
      cantidadLineas: 1,
      clienteId: null,
    });
    expect(r.vuelto).toBeCloseTo(2, 2); // se sigue mostrando como exceso general
    expect(r.vueltoEfectivoUsd).toBe(0); // pero no es vuelto en efectivo
  });

  it("pago mixto: no-efectivo cubre una parte, el efectivo sobrante sí es vuelto real", () => {
    // Total $8: paga $5 por pago móvil + efectivo_bs equivalente a $5 (necesita
    // solo $3 en efectivo) → vuelto real en efectivo = $2.
    const r = computeCobro({
      pagos: [
        { metodo: "pago_movil", monto: "3125" }, // $5 @625
        { metodo: "efectivo_bs", monto: "3125" }, // $5 @625
      ],
      subtotalNeto: 8,
      tasa: 625,
      cantidadLineas: 1,
      clienteId: null,
    });
    expect(r.vueltoEfectivoUsd).toBeCloseTo(2, 2);
  });

  it("el fiado reduce lo que hace falta en efectivo antes de calcular el vuelto", () => {
    const r = computeCobro({
      pagos: [
        { metodo: "efectivo_bs", monto: "6250" }, // $10 @625
        { metodo: "fiado", monto: "" }, // absorbe el restante
      ],
      subtotalNeto: 8,
      tasa: 625,
      cantidadLineas: 1,
      clienteId: "cliente-x",
    });
    // El efectivo ($10) ya cubre el total ($8): el restante para fiado es $0,
    // y el vuelto real en efectivo es $2 (10 - 8).
    expect(r.fiadoMonto).toBe(0);
    expect(r.vueltoEfectivoUsd).toBeCloseTo(2, 2);
  });
});

describe("computeCobro — IGTF sobre el monto ENTREGADO, no sobre el vuelto real (hallazgo, sin corregir)", () => {
  // Documenta un comportamiento existente (no introducido en esta sesión):
  // el IGTF se calcula sobre TODO lo que el cajero escribe en una fila
  // efectivo_usd/Zelle, incluso la parte que vuelve como vuelto. En la
  // práctica venezolana (pagar con billete de $100 por una venta de $50) esto
  // infla el IGTF cobrado y el total de la venta. Corregirlo de raíz requiere
  // resolver cuánto del monto entregado se "aplica" de verdad (con una
  // fórmula circular: el monto aplicado también genera su propio IGTF — el
  // mismo cálculo que ya usa el botón "← saldo"), lo cual es un cambio de
  // fondo al cálculo del total de la venta, no solo a caja. Reportado al
  // usuario; pendiente de decisión antes de tocarlo.
  it("venta $50 pagada con $100 efectivo USD: el IGTF se cobra sobre $100, no sobre los $50 reales", () => {
    const r = computeCobro({
      pagos: [{ metodo: "efectivo_usd", monto: "100" }],
      subtotalNeto: 50,
      tasa: 100,
      cantidadLineas: 1,
      clienteId: null,
    });
    expect(r.igtf).toBeCloseTo(3, 2); // 100 * 3%, no 50 * 3% ($1.5)
    expect(r.totalUsd).toBeCloseTo(53, 2); // debería rondar $51.5 si el IGTF fuera solo sobre lo aplicado
  });
});

describe("computeCobro — cambiar la tasa recalcula los pagos en Bs en vivo", () => {
  // Caso reportado por el usuario: venta de $10, tasa 40 → total 400 Bs. El
  // cajero pone 400 Bs (físicos) en pago móvil y cubre el total. Si la tasa
  // sube a 50, esos MISMOS 400 Bs físicos ya no alcanzan (el total sube a
  // 500 Bs) y deberían faltar 100 Bs. `computeCobro` es una función pura: el
  // "cambio de tasa" es simplemente llamarla de nuevo con el mismo `pagos`
  // (el monto en Bs que escribió el cajero NUNCA se toca) y una `tasa`
  // distinta — así se prueba exactamente lo que hace el diálogo de cobro al
  // cambiar el selector de tasa, sin necesitar React.
  const pagos400Bs = [{ metodo: "pago_movil" as const, monto: "400" }];

  it("con tasa 40: 400 Bs cubren exactamente los $10", () => {
    const r = computeCobro({
      pagos: pagos400Bs,
      subtotalNeto: 10,
      tasa: 40,
      cantidadLineas: 1,
      clienteId: null,
    });
    expect(r.totalUsd).toBe(10);
    expect(r.totalBs).toBe(400);
    expect(r.cubiertoSinFiado).toBeCloseTo(10, 2);
    expect(r.faltante).toBe(0);
    expect(r.puedeConfirmar).toBe(true);
  });

  it("con tasa 50 (mismos 400 Bs escritos): el total sube a 500 Bs y faltan $2 (100 Bs)", () => {
    const r = computeCobro({
      pagos: pagos400Bs, // el mismo string "400" — el cajero no reescribió nada
      subtotalNeto: 10,
      tasa: 50,
      cantidadLineas: 1,
      clienteId: null,
    });
    expect(r.totalUsd).toBe(10); // el total en USD no cambia con la tasa
    expect(r.totalBs).toBe(500); // el equivalente en Bs sí, con la tasa nueva
    expect(r.cubiertoSinFiado).toBeCloseTo(8, 2); // 400 Bs / 50 = $8
    expect(r.faltante).toBeCloseTo(2, 2); // faltan $2 = 100 Bs a la tasa nueva
    expect(r.puedeConfirmar).toBe(false);
  });

  it("los pagos en USD (efectivo_usd/zelle) no cambian su equivalente en USD al cambiar la tasa", () => {
    const pagosUsd = [{ metodo: "efectivo_usd" as const, monto: "10" }];
    const conTasa40 = computeCobro({
      pagos: pagosUsd,
      subtotalNeto: 10,
      tasa: 40,
      cantidadLineas: 1,
      clienteId: null,
      igtfActivo: false,
    });
    const conTasa50 = computeCobro({
      pagos: pagosUsd,
      subtotalNeto: 10,
      tasa: 50,
      cantidadLineas: 1,
      clienteId: null,
      igtfActivo: false,
    });
    expect(conTasa40.cubiertoSinFiado).toBe(conTasa50.cubiertoSinFiado);
    expect(conTasa40.faltante).toBe(conTasa50.faltante);
    // Solo el equivalente en Bs mostrado cambia, no el monto en USD cobrado.
    expect(conTasa40.totalBs).toBe(400);
    expect(conTasa50.totalBs).toBe(500);
  });
});

describe("computeCobro — excedente cuando el pago de más es 100% digital (sin efectivo)", () => {
  // Caso reportado por el usuario: total $35, paga $36 por pago móvil (ningún
  // efectivo de por medio). `vueltoEfectivoUsd` da 0 (correcto: no hay plata
  // física que devolver de la gaveta), pero `vuelto` YA calcula el excedente
  // real de $1 — este es el campo que la UI debe usar para ofrecer
  // "Acreditar" o "Devolver", no `vueltoEfectivoUsd`. Este test no necesita
  // ningún cambio de código: confirma que el campo correcto ya existe.
  it("vuelto=$1 aunque vueltoEfectivoUsd=0 cuando el excedente viene solo de pago móvil", () => {
    const r = computeCobro({
      pagos: [{ metodo: "pago_movil", monto: "3600" }], // $36 @ tasa 100, total es $35
      subtotalNeto: 35,
      tasa: 100,
      cantidadLineas: 1,
      clienteId: null,
      igtfActivo: false,
    });
    expect(r.totalUsd).toBe(35);
    expect(r.vuelto).toBeCloseTo(1, 2);
    expect(r.vueltoEfectivoUsd).toBe(0);
  });
});

describe("computeCobro — saldo a favor del cliente (credito_cliente)", () => {
  // Regresión: agregar el parámetro `saldoFavorDisponible` sin ninguna fila
  // credito_cliente NO debe cambiar absolutamente nada del resultado.
  it("sin fila credito_cliente, saldoFavorDisponible no afecta el resultado", () => {
    const base = {
      pagos: [
        { metodo: "efectivo_bs" as const, monto: "500" },
        { metodo: "fiado" as const, monto: "" },
      ],
      subtotalNeto: 1.6,
      tasa: 625,
      cantidadLineas: 1,
      clienteId: "cliente-x",
    };
    const sinParam = computeCobro(base);
    const conParam = computeCobro({ ...base, saldoFavorDisponible: 50 });
    expect(conParam).toEqual(sinParam);
  });

  it("el crédito cubre parte del total y el resto lo paga efectivo", () => {
    // Total $10. Cliente tiene $3 de saldo a favor, paga $7 en efectivo USD.
    const r = computeCobro({
      pagos: [
        { metodo: "credito_cliente", monto: "3" },
        { metodo: "efectivo_usd", monto: "7" },
      ],
      subtotalNeto: 10,
      tasa: 100,
      cantidadLineas: 1,
      clienteId: "cliente-x",
      saldoFavorDisponible: 3,
      igtfActivo: false,
    });
    expect(r.totalUsd).toBe(10);
    expect(r.creditoMonto).toBeCloseTo(3, 2);
    expect(r.cubierto).toBeCloseTo(10, 2);
    expect(r.faltante).toBe(0);
    expect(r.puedeConfirmar).toBe(true);
  });

  it("BLOQUEA si se intenta usar más crédito del que el cliente tiene disponible", () => {
    const r = computeCobro({
      pagos: [
        { metodo: "credito_cliente", monto: "5" }, // pide $5...
        { metodo: "efectivo_usd", monto: "5" },
      ],
      subtotalNeto: 10,
      tasa: 100,
      cantidadLineas: 1,
      clienteId: "cliente-x",
      saldoFavorDisponible: 3, // ...pero solo tiene $3
      igtfActivo: false,
    });
    expect(r.faltante).toBe(0); // los montos escritos sí suman el total...
    expect(r.puedeConfirmar).toBe(false); // ...pero no se permite exceder el saldo disponible
  });

  it("BLOQUEA si hay fila credito_cliente pero no hay cliente seleccionado", () => {
    const r = computeCobro({
      pagos: [
        { metodo: "credito_cliente", monto: "3" },
        { metodo: "efectivo_usd", monto: "7" },
      ],
      subtotalNeto: 10,
      tasa: 100,
      cantidadLineas: 1,
      clienteId: null,
      saldoFavorDisponible: 3,
      igtfActivo: false,
    });
    expect(r.puedeConfirmar).toBe(false);
  });

  it("el crédito reduce lo que le queda a fiado (no se cobra dos veces)", () => {
    // Total $10. Cliente usa $3 de crédito, el resto ($7) lo deja a fiado.
    const r = computeCobro({
      pagos: [
        { metodo: "credito_cliente", monto: "3" },
        { metodo: "fiado", monto: "" }, // auto = restante DESPUÉS del crédito
      ],
      subtotalNeto: 10,
      tasa: 100,
      cantidadLineas: 1,
      clienteId: "cliente-x",
      saldoFavorDisponible: 3,
    });
    expect(r.creditoMonto).toBeCloseTo(3, 2);
    expect(r.fiadoMonto).toBeCloseTo(7, 2); // NO $10 — ya se descontó el crédito
    expect(r.faltante).toBe(0);
    expect(r.puedeConfirmar).toBe(true);
  });

  it("hayCredito es false cuando no hay ninguna fila credito_cliente", () => {
    const r = computeCobro({
      pagos: [{ metodo: "efectivo_bs", monto: "1000" }],
      subtotalNeto: 1.6,
      tasa: 625,
      cantidadLineas: 1,
      clienteId: null,
    });
    expect(r.hayCredito).toBe(false);
    expect(r.creditoMonto).toBe(0);
  });
});

describe("calcularMontoSaldo — sugerencia para la fila credito_cliente", () => {
  it("sugiere el faltante cuando el crédito disponible alcanza para cubrirlo todo", () => {
    const pagos = [{ key: "p1", metodo: "credito_cliente" as const, monto: "", autoSaldo: true }];
    const sugerido = calcularMontoSaldo(pagos, "p1", 5, 100, true, false, 0, 20);
    expect(sugerido).toBe("5.00");
  });

  it("sugiere solo el crédito disponible cuando es MENOR que el faltante (no más de lo que hay)", () => {
    const pagos = [{ key: "p1", metodo: "credito_cliente" as const, monto: "", autoSaldo: true }];
    const sugerido = calcularMontoSaldo(pagos, "p1", 10, 100, true, false, 0, 3);
    expect(sugerido).toBe("3.00");
  });

  it("saldoFavorDisponible por defecto es 0 si no se pasa (compatibilidad hacia atrás)", () => {
    const pagos = [{ key: "p1", metodo: "credito_cliente" as const, monto: "", autoSaldo: true }];
    const sugerido = calcularMontoSaldo(pagos, "p1", 10, 100, true, false, 0);
    expect(sugerido).toBe("0.00");
  });
});

describe("computeCobro — sin tasa no se puede cobrar", () => {
  it("devuelve puedeConfirmar=false cuando tasa es null", () => {
    const r = computeCobro({
      pagos: [{ metodo: "efectivo_bs", monto: "1000" }],
      subtotalNeto: 1.6,
      tasa: null,
      cantidadLineas: 1,
      clienteId: null,
    });
    expect(r.puedeConfirmar).toBe(false);
  });
});

describe("recalcularPagosPorTasa — bug: cambiar la tasa descuadraba el pago en Bs", () => {
  // Caso real reportado: venta $1.20. Con tasa BCV 721.35 el efectivo Bs se
  // llena con "← saldo" en 865.62 (cubre todo). Al cambiar a Euro BCV 823.94,
  // el TOTAL en Bs sí sube a 988.73, pero el monto ya puesto en efectivo Bs se
  // quedaba en 865.62 → "Faltan Bs 123.59". Debe recalcularse solo a 988.73.
  it("recalcula el efectivo Bs puesto con '← saldo' al nuevo total tras cambiar de BCV a Euro BCV", () => {
    const TASA_BCV = 721.35;
    const TASA_EURO = 823.94;
    const subtotalNeto = 1.2;

    // 1) Se abre el cobro / se presiona "← saldo": efectivo Bs cubre todo a tasa BCV.
    let pagos = [{ key: "p1", metodo: "efectivo_bs" as const, monto: "", autoSaldo: false }];
    const sugerido = calcularMontoSaldo(pagos, "p1", subtotalNeto, TASA_BCV, true, false, 0);
    expect(sugerido).toBe("865.62");
    if (!sugerido) throw new Error("esperaba un monto sugerido");
    const [filaOriginal] = pagos;
    if (!filaOriginal) throw new Error("esperaba una fila de pago");
    pagos = [{ ...filaOriginal, monto: sugerido, autoSaldo: true }];

    const antes = computeCobro({
      pagos: pagos.map((p) => ({ metodo: p.metodo, monto: p.monto })),
      subtotalNeto,
      tasa: TASA_BCV,
      cantidadLineas: 1,
      clienteId: null,
    });
    expect(antes.faltante).toBe(0);
    expect(antes.puedeConfirmar).toBe(true);

    // 2) El cajero cambia la tasa de cobro a Euro BCV.
    const pagosTrasCambio = recalcularPagosPorTasa(pagos, subtotalNeto, TASA_EURO, true, false, 0);
    expect(pagosTrasCambio.at(0)?.monto).toBe("988.73");

    const despues = computeCobro({
      pagos: pagosTrasCambio.map((p) => ({ metodo: p.metodo, monto: p.monto })),
      subtotalNeto,
      tasa: TASA_EURO,
      cantidadLineas: 1,
      clienteId: null,
    });
    expect(despues.totalBs).toBeCloseTo(988.73, 1);
    expect(despues.faltante).toBe(0);
    expect(despues.puedeConfirmar).toBe(true);
  });

  it("NO toca un monto en Bs tecleado a mano (autoSaldo=false) al cambiar la tasa", () => {
    const pagos = [
      { key: "p1", metodo: "efectivo_bs" as const, monto: "500", autoSaldo: false },
      { key: "p2", metodo: "fiado" as const, monto: "", autoSaldo: false },
    ];
    const resultado = recalcularPagosPorTasa(pagos, 1.6, 823.94, true, false, 0);
    expect(resultado).toBe(pagos); // mismo array: no hubo nada que recalcular
  });

  it("NO toca los montos en USD (efectivo_usd, Zelle) al cambiar la tasa", () => {
    const pagos = [{ key: "p1", metodo: "zelle" as const, monto: "1.20", autoSaldo: true }];
    const resultado = recalcularPagosPorTasa(pagos, 1.2, 823.94, true, false, 0);
    expect(resultado.at(0)?.monto).toBe("1.20");
  });

  it("recalcula pago móvil en Bs marcado autoSaldo igual que efectivo Bs", () => {
    const pagos = [{ key: "p1", metodo: "pago_movil" as const, monto: "865.62", autoSaldo: true }];
    const resultado = recalcularPagosPorTasa(pagos, 1.2, 823.94, true, false, 0);
    expect(resultado.at(0)?.monto).toBe("988.73");
  });
});

describe("regresión: prefill inicial del diálogo de cobro con un método por defecto que NO es Bs", () => {
  // Bug real (venta $1.63 + IVA 16%, pagada en efectivo USD): el diálogo de
  // cobro pre-llenaba SIEMPRE el monto multiplicando (subtotal + IVA) por la
  // tasa, asumiendo a fuego que la fila era en bolívares. Si el método por
  // defecto termina siendo uno en USD/divisa (ej. "Efectivo Bs" desactivado
  // en Configuración y el sistema cae al siguiente método activo), ese monto
  // en escala Bs quedaba metido en una fila que se interpreta como USD sin
  // dividir por la tasa — el IGTF se calculaba sobre un monto ~200x más
  // grande de lo real (USD 41.78 en vez de USD 0.05). La cuenta correcta para
  // CUALQUIER método (Bs, USD, con o sin IGTF) es `calcularMontoSaldo` — la
  // misma que ya usa el botón "← saldo" — así que el pre-llenado inicial debe
  // salir de ahí, nunca de multiplicar por la tasa a ciegas.
  const TASA = 200;
  const subtotalNeto = 1.63;

  it("calcularMontoSaldo para una fila sola en efectivo_usd sugiere un monto en escala USD, no en escala Bs", () => {
    const filaInicial = { key: "p1", metodo: "efectivo_usd" as const, monto: "", autoSaldo: true };
    const sugerido = calcularMontoSaldo([filaInicial], "p1", subtotalNeto, TASA, true, true, 16);
    // Con gross-up de IGTF: (1.63 + 0.26) / (1 - 0.03) ≈ 1.95 — del orden del
    // subtotal, NUNCA algo cercano a subtotalNeto * TASA (326).
    expect(sugerido).toBe("1.95");
    expect(Number(sugerido)).toBeLessThan(10);
  });

  it("con ese monto, computeCobro da un IGTF y un total coherentes con el subtotal (no inflados)", () => {
    const filaInicial = { key: "p1", metodo: "efectivo_usd" as const, monto: "", autoSaldo: true };
    const sugerido = calcularMontoSaldo([filaInicial], "p1", subtotalNeto, TASA, true, true, 16);
    if (!sugerido) throw new Error("esperaba un monto sugerido");

    const r = computeCobro({
      pagos: [{ metodo: "efectivo_usd", monto: sugerido }],
      subtotalNeto,
      tasa: TASA,
      cantidadLineas: 1,
      clienteId: null,
      igtfActivo: true,
      ivaActivo: true,
      ivaPct: 16,
    });

    expect(r.igtf).toBeLessThan(1); // antes del fix: 41.78
    expect(r.totalUsd).toBeLessThan(3); // antes del fix: 43.67
    expect(r.faltante).toBe(0);
    expect(r.puedeConfirmar).toBe(true);
  });

  it("un cajero tecleando el subtotal exacto (1.63) en efectivo USD da IGTF ≈ 0.05 y total ≈ 1.94", () => {
    const r = computeCobro({
      pagos: [{ metodo: "efectivo_usd", monto: "1.63" }],
      subtotalNeto,
      tasa: TASA,
      cantidadLineas: 1,
      clienteId: null,
      igtfActivo: true,
      ivaActivo: true,
      ivaPct: 16,
    });

    expect(r.igtf).toBeCloseTo(0.05, 2);
    expect(r.ivaUsd).toBeCloseTo(0.26, 2);
    expect(r.totalUsd).toBeCloseTo(1.94, 2);
  });
});

describe("regresión: el saldo sugerido no coincidía con el total (con y sin IGTF activo)", () => {
  // Bug real: `calcularMontoSaldo` no recibía `igtfActivo` — SIEMPRE aplicaba
  // el ajuste del 3% para efectivo USD/Zelle, sin importar que el negocio
  // tuviera el IGTF desactivado. Y aun con IGTF genuinamente activo, la
  // fórmula de gross-up (ceil ingenuo) podía sugerir un monto un centavo por
  // ENCIMA del total que `computeCobro` recalculaba con ese mismo monto,
  // dejando un vuelto fantasma. Subtotal $3.33 (sin IVA) reproduce ambos
  // casos reportados: total $3.43 con IGTF, $3.33 sin IGTF.
  const subtotalNeto = 3.33;
  const TASA = 100;

  it("con IGTF activo, el saldo sugerido coincide EXACTO con el total recalculado — sin vuelto fantasma", () => {
    const fila = { key: "p1", metodo: "efectivo_usd" as const, monto: "", autoSaldo: true };
    const sugerido = calcularMontoSaldo([fila], "p1", subtotalNeto, TASA, true, false, 0);
    expect(sugerido).toBe("3.43"); // antes del fix: "3.44"

    const r = computeCobro({
      pagos: [{ metodo: "efectivo_usd", monto: sugerido ?? "" }],
      subtotalNeto,
      tasa: TASA,
      cantidadLineas: 1,
      clienteId: null,
      igtfActivo: true,
      ivaActivo: false,
      ivaPct: 0,
    });
    expect(r.totalUsd).toBe(3.43);
    expect(r.vuelto).toBe(0); // antes del fix: 0.01 de vuelto fantasma
    expect(r.faltante).toBe(0);
  });

  it("con IGTF inactivo, el saldo sugerido NO aplica el ajuste del 3% — coincide con el subtotal", () => {
    const fila = { key: "p1", metodo: "efectivo_usd" as const, monto: "", autoSaldo: true };
    const sugerido = calcularMontoSaldo([fila], "p1", subtotalNeto, TASA, false, false, 0);
    expect(sugerido).toBe("3.33"); // antes del fix: "3.44" (ignoraba igtfActivo)

    const r = computeCobro({
      pagos: [{ metodo: "efectivo_usd", monto: sugerido ?? "" }],
      subtotalNeto,
      tasa: TASA,
      cantidadLineas: 1,
      clienteId: null,
      igtfActivo: false,
      ivaActivo: false,
      ivaPct: 0,
    });
    expect(r.totalUsd).toBe(3.33);
    expect(r.vuelto).toBe(0); // antes del fix: 0.11 de vuelto fantasma
    expect(r.faltante).toBe(0);
  });
});

describe("calcularExcedenteBs — vuelto en Bs sin arrastre de centavos (bug de auditoría en vivo)", () => {
  it("caso real: venta $13.92 (Bs 10.423,16), tendido Bs 11.000 → vuelto exacto Bs 576,84, no 576,57", () => {
    // Antes del fix: Math.round(vuelto_usd * tasa * 100) / 100 con
    // vuelto_usd=0.77 (ya redondeado) daba Bs 576,57 — 0,27 Bs por debajo
    // del vuelto real (11.000 - 10.423,16 = 576,84).
    const tasa = 748.79;
    const totalBs = 10423.16;
    const excedente = calcularExcedenteBs(
      [{ metodo: "efectivo_bs", monto: "11000" }],
      tasa,
      totalBs,
    );
    expect(excedente).toBe(576.84);
  });

  it("pago exacto: sin excedente", () => {
    const tasa = 748.79;
    const totalBs = 10423.16;
    const excedente = calcularExcedenteBs(
      [{ metodo: "efectivo_bs", monto: "10423.16" }],
      tasa,
      totalBs,
    );
    expect(excedente).toBe(0);
  });

  it("pago en USD (efectivo_usd) convierte una sola vez con la tasa", () => {
    const tasa = 748.79;
    const totalBs = 8985.48; // $12 * 748.79
    const excedente = calcularExcedenteBs([{ metodo: "efectivo_usd", monto: "15" }], tasa, totalBs);
    // (15 - 12) * 748.79 = 2246.37
    expect(excedente).toBeCloseTo(2246.37, 2);
  });

  it("pago mixto (efectivo Bs + pago móvil Bs): suma ambos antes de restar el total", () => {
    const tasa = 748.79;
    const totalBs = 8985.48;
    const excedente = calcularExcedenteBs(
      [
        { metodo: "efectivo_bs", monto: "5000" },
        { metodo: "pago_movil", monto: "5000" },
      ],
      tasa,
      totalBs,
    );
    expect(excedente).toBeCloseTo(1014.52, 2); // 10000 - 8985.48
  });

  it("ignora fiado/credito_cliente salvo por su aporte explícito en USD", () => {
    const tasa = 748.79;
    const totalBs = 8985.48; // $12
    // $8 en efectivo Bs + $4 fiado ya cubren el total exacto — sin excedente.
    const excedente = calcularExcedenteBs(
      [
        { metodo: "efectivo_bs", monto: String(8 * tasa) },
        { metodo: "fiado", monto: "4" },
      ],
      tasa,
      totalBs,
      4,
      0,
    );
    expect(excedente).toBe(0);
  });

  it("nunca devuelve un excedente negativo cuando el pago no alcanza a cubrir el total", () => {
    const tasa = 748.79;
    const totalBs = 8985.48;
    const excedente = calcularExcedenteBs(
      [{ metodo: "efectivo_bs", monto: "1000" }],
      tasa,
      totalBs,
    );
    expect(excedente).toBe(0);
  });
});

describe("subtotalNetoGravado — bug real: producto EXENTO no debe pagar IVA", () => {
  it("un carrito 100% exento da base gravada $0, sin importar el precio", () => {
    const base = subtotalNetoGravado([{ totalUsd: 10, impuestoId: "exento" }], 0);
    expect(base).toBe(0);
  });

  it("un carrito 100% gravado da la misma base que el subtotal neto completo (sin cambios de siempre)", () => {
    const base = subtotalNetoGravado([{ totalUsd: 10, impuestoId: "iva" }], 0);
    expect(base).toBe(10);
  });

  it("carrito mixto: solo suma la parte gravada, la exenta queda fuera", () => {
    // $10 exento + $20 gravado, sin descuento.
    const base = subtotalNetoGravado(
      [
        { totalUsd: 10, impuestoId: "exento" },
        { totalUsd: 20, impuestoId: "iva" },
      ],
      0,
    );
    expect(base).toBe(20);
  });

  it("reparte el descuento proporcionalmente entre lo gravado y lo exento", () => {
    // $10 exento + $30 gravado = $40 bruto, descuento $8 (20% del bruto).
    // Gravado ($30) absorbe el 75% del descuento ($6) → base gravada $24.
    const base = subtotalNetoGravado(
      [
        { totalUsd: 10, impuestoId: "exento" },
        { totalUsd: 30, impuestoId: "iva" },
      ],
      8,
    );
    expect(base).toBe(24);
  });
});

describe("computeCobro — bug real: producto EXENTO se cobraba IVA igual (reportado en vivo)", () => {
  it("venta 100% exenta ($10, IVA 16% activo en el negocio): total = $10, IVA = $0", () => {
    const r = computeCobro({
      pagos: [{ metodo: "efectivo_usd", monto: "10" }],
      subtotalNeto: 10,
      subtotalGravado: 0, // el único producto de la venta está marcado "Exento"
      tasa: 100,
      cantidadLineas: 1,
      clienteId: null,
      igtfActivo: false,
      ivaActivo: true,
      ivaPct: 16,
    });
    expect(r.ivaUsd).toBe(0);
    expect(r.totalUsd).toBe(10); // antes del fix: $11.60 (cobraba IVA a un exento)
  });

  it("venta mixta ($10 exento + $20 gravado, IVA 16%): el IVA solo cae sobre el gravado", () => {
    const r = computeCobro({
      pagos: [{ metodo: "efectivo_usd", monto: "33.2" }],
      subtotalNeto: 30, // $10 + $20
      subtotalGravado: 20, // solo la línea gravada
      tasa: 100,
      cantidadLineas: 2,
      clienteId: null,
      igtfActivo: false,
      ivaActivo: true,
      ivaPct: 16,
    });
    expect(r.ivaUsd).toBeCloseTo(3.2, 2); // 16% de $20, NO de los $30 completos
    expect(r.totalUsd).toBeCloseTo(33.2, 2); // antes del fix: $34.80 (16% de $30)
    expect(r.faltante).toBe(0);
  });

  it("sin subtotalGravado (comportamiento anterior a que existieran productos exentos): sigue igual", () => {
    // Regresión: un carrito enteramente gravado (todas las líneas pagan IVA)
    // no debe cambiar en nada — REGLA CRÍTICA #1. `subtotalGravado` es
    // opcional y por defecto vale lo mismo que `subtotalNeto`.
    const r = computeCobro({
      pagos: [{ metodo: "efectivo_usd", monto: "23.2" }],
      subtotalNeto: 20,
      tasa: 100,
      cantidadLineas: 1,
      clienteId: null,
      igtfActivo: false,
      ivaActivo: true,
      ivaPct: 16,
    });
    expect(r.ivaUsd).toBeCloseTo(3.2, 2); // 16% de los $20 completos, como siempre
    expect(r.totalUsd).toBeCloseTo(23.2, 2);
  });
});
