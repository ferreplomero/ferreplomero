import { describe, expect, it } from "vitest";
import {
  detectarFilaEncabezado,
  detectarMapeoColumnas,
  extraerTasaDeResumen,
  filasACsvCanonico,
  limpiarMonto,
  normalizarEncabezado,
  normalizarFilasFiado,
  parsearFechaFlexible,
  resolverCedula,
  resolverMontoMoneda,
} from "./carga-fiados-normalizador";

describe("normalizarEncabezado", () => {
  it("quita acentos, mayúsculas y puntuación", () => {
    expect(normalizarEncabezado("Cédula")).toBe("cedula");
    expect(normalizarEncabezado("Límite de Crédito")).toBe("limite de credito");
  });

  it("convierte $ en la palabra usd para no perder la señal de moneda", () => {
    expect(normalizarEncabezado("Pendiente $")).toBe("pendiente usd");
  });

  it("colapsa espacios repetidos", () => {
    expect(normalizarEncabezado("  Nombre   del   Cliente  ")).toBe("nombre del cliente");
  });
});

describe("detectarFilaEncabezado", () => {
  it("encuentra el encabezado real saltando filas de título/resumen", () => {
    const filas = [
      ["INVERSIONES LA HERMANDAD P&C"],
      ["Resumen General"],
      ["Tasa BCV usada: 742.22 Bs/$"],
      ["Cliente", "Fecha", "Estado", "Pendiente $", "Pendiente Bs"],
      ["Juan Pérez", "27/04/2026 09:04 p. m.", "FIADO", "50", "37111"],
    ];
    const { indice, automatica } = detectarFilaEncabezado(filas);
    expect(indice).toBe(3);
    expect(automatica).toBe(true);
  });

  it("detecta la fila 0 como encabezado en la plantilla canónica del sistema", () => {
    const filas = [
      ["nombre", "cedula", "telefono", "whatsapp", "direccion", "limite_fiado_usd"],
      ["Ana Gómez", "V12345678", "", "", "", "0"],
    ];
    const { indice, automatica } = detectarFilaEncabezado(filas);
    expect(indice).toBe(0);
    expect(automatica).toBe(true);
  });

  it("cae a la fila 0 sin marcar automática si ninguna fila matchea", () => {
    const filas = [
      ["algo", "irrelevante"],
      ["otra cosa", "más"],
    ];
    const { indice, automatica } = detectarFilaEncabezado(filas);
    expect(indice).toBe(0);
    expect(automatica).toBe(false);
  });
});

describe("detectarMapeoColumnas", () => {
  it("mapea el encabezado del export del prospecto", () => {
    const mapeo = detectarMapeoColumnas([
      "Cliente",
      "Fecha",
      "Estado",
      "Pendiente $",
      "Pendiente Bs",
    ]);
    expect(mapeo.nombre).toEqual({ indice: 0, encabezadoOriginal: "Cliente" });
    expect(mapeo.fecha_deuda).toEqual({ indice: 1, encabezadoOriginal: "Fecha" });
    expect(mapeo.nota).toEqual({ indice: 2, encabezadoOriginal: "Estado" });
    expect(mapeo.monto_usd).toEqual({ indice: 3, encabezadoOriginal: "Pendiente $" });
    expect(mapeo.monto_bs).toEqual({ indice: 4, encabezadoOriginal: "Pendiente Bs" });
    expect(mapeo.cedula.indice).toBeNull();
  });

  it("mapea la plantilla canónica 1:1 (cada columna es alias de sí misma)", () => {
    const mapeo = detectarMapeoColumnas([
      "nombre",
      "cedula",
      "telefono",
      "whatsapp",
      "direccion",
      "limite_fiado_usd",
      "monto_adeudado",
      "moneda",
      "tasa",
      "fecha_deuda",
      "nota",
    ]);
    expect(mapeo.nombre.indice).toBe(0);
    expect(mapeo.cedula.indice).toBe(1);
    expect(mapeo.monto_usd.indice).toBe(6);
    expect(mapeo.moneda.indice).toBe(7);
    expect(mapeo.tasa.indice).toBe(8);
    expect(mapeo.fecha_deuda.indice).toBe(9);
    expect(mapeo.nota.indice).toBe(10);
  });

  it("ignora columnas sin sinónimo reconocido", () => {
    const mapeo = detectarMapeoColumnas(["Columna rara", "nombre"]);
    expect(mapeo.nombre.indice).toBe(1);
  });
});

describe("limpiarMonto", () => {
  it("parsea números con coma decimal", () => {
    expect(limpiarMonto("742,22")).toBeCloseTo(742.22);
  });

  it("parsea números con punto decimal y separador de miles con coma", () => {
    expect(limpiarMonto("1,234.56")).toBeCloseTo(1234.56);
  });

  it("quita símbolos de moneda", () => {
    expect(limpiarMonto("$ 50.00")).toBeCloseTo(50);
    expect(limpiarMonto("Bs 37.111,20")).toBeCloseTo(37111.2);
  });

  it("devuelve null para celdas vacías", () => {
    expect(limpiarMonto("")).toBeNull();
    expect(limpiarMonto(null)).toBeNull();
    expect(limpiarMonto(undefined)).toBeNull();
  });

  it("acepta números ya numéricos", () => {
    expect(limpiarMonto(50)).toBe(50);
  });
});

describe("extraerTasaDeResumen", () => {
  it("extrae la tasa del texto de resumen del archivo del prospecto", () => {
    const filas = [
      ["INVERSIONES LA HERMANDAD P&C"],
      ["Resumen General"],
      ["Tasa BCV usada: 742.22 Bs/$"],
      ["Cliente", "Fecha", "Estado", "Pendiente $", "Pendiente Bs"],
    ];
    expect(extraerTasaDeResumen(filas, 3)).toBeCloseTo(742.22);
  });

  it("devuelve null si no hay texto de tasa (opcional)", () => {
    const filas = [["Título"], ["Cliente", "Fecha"]];
    expect(extraerTasaDeResumen(filas, 1)).toBeNull();
  });
});

describe("parsearFechaFlexible", () => {
  it("acepta AAAA-MM-DD tal cual", () => {
    expect(parsearFechaFlexible("2026-04-27")).toBe("2026-04-27");
  });

  it("acepta DD/MM/AAAA", () => {
    expect(parsearFechaFlexible("27/04/2026")).toBe("2026-04-27");
  });

  it("acepta DD/MM/AAAA hh:mm a. m./p. m. y descarta la hora", () => {
    expect(parsearFechaFlexible("27/04/2026 09:04 p. m.")).toBe("2026-04-27");
    expect(parsearFechaFlexible("5/1/2026 11:59 a. m.")).toBe("2026-01-05");
  });

  it("devuelve vacío (nunca basura) cuando no se puede interpretar", () => {
    expect(parsearFechaFlexible("hace 3 días")).toBe("");
    expect(parsearFechaFlexible("")).toBe("");
    expect(parsearFechaFlexible(null)).toBe("");
  });
});

describe("resolverCedula", () => {
  it("acepta el formato canónico tal cual, en mayúsculas", () => {
    expect(resolverCedula("v12345678")).toEqual({ cedula: "V12345678", ajustada: false });
  });

  it("antepone V a cédulas de solo dígitos y lo marca como ajustada", () => {
    expect(resolverCedula("12345678")).toEqual({ cedula: "V12345678", ajustada: true });
  });

  it("deja vacío (nunca basura) lo que no matchea ninguna regla", () => {
    expect(resolverCedula("no tiene")).toEqual({ cedula: "", ajustada: false });
    expect(resolverCedula("")).toEqual({ cedula: "", ajustada: false });
    expect(resolverCedula(null)).toEqual({ cedula: "", ajustada: false });
  });
});

describe("resolverMontoMoneda", () => {
  it("USD siempre gana cuando viene con valor, nunca se suma con Bs", () => {
    const r = resolverMontoMoneda("50", "37111", null, 742.22, 40);
    expect(r).toEqual({
      montoCanonico: 50,
      monedaCanonica: "USD",
      tasaCanonica: "",
      montoUsdEquivalente: 50,
    });
  });

  it("Bs con columna de tasa-tipo pasa intacto (el parser existente convierte)", () => {
    const r = resolverMontoMoneda(null, "1000", "bcv", null, 40);
    expect(r.montoCanonico).toBe(1000);
    expect(r.monedaCanonica).toBe("Bs");
    expect(r.tasaCanonica).toBe("bcv");
  });

  it("Bs sin columna de tasa-tipo se autoconvierte con la tasa del resumen del archivo", () => {
    const r = resolverMontoMoneda(null, "37111", null, 742.22, 40);
    expect(r.monedaCanonica).toBe("USD");
    expect(r.montoCanonico).toBeCloseTo(49.99, 1);
    expect(r.tasaCanonica).toBe("");
  });

  it("cae a la tasa del negocio si no hay tasa de resumen", () => {
    const r = resolverMontoMoneda(null, "2000", null, null, 40);
    expect(r.monedaCanonica).toBe("USD");
    expect(r.montoCanonico).toBeCloseTo(50);
  });

  it("sin ninguna tasa disponible deja el monto en Bs sin tasa (el parser usará la del negocio)", () => {
    const r = resolverMontoMoneda(null, "2000", null, null, null);
    expect(r.monedaCanonica).toBe("Bs");
    expect(r.montoCanonico).toBe(2000);
    expect(r.montoUsdEquivalente).toBe(0);
  });

  it("sin ningún monto devuelve cero", () => {
    const r = resolverMontoMoneda(null, null, null, null, null);
    expect(r.montoCanonico).toBe(0);
  });
});

describe("normalizarFilasFiado — export del prospecto (formato real)", () => {
  const filas = [
    ["INVERSIONES LA HERMANDAD P&C"],
    ["Resumen General"],
    ["Tasa BCV usada: 742.22 Bs/$"],
    ["Cliente", "Fecha", "Estado", "Pendiente $", "Pendiente Bs"],
    ["Juan Pérez", "27/04/2026 09:04 p. m.", "FIADO", "50", "37111"],
    ["Juan Pérez", "10/03/2026 08:00 a. m.", "ABONADO", "20", "14844.4"],
    ["María Rodríguez", "01/01/2026 10:00 a. m.", "FIADO", "13.80", "10242.64"],
    ["", "", "", "", ""],
  ];
  const indiceEncabezado = 3;
  const mapeo = detectarMapeoColumnas(filas[indiceEncabezado] ?? []);
  const tasaResumen = extraerTasaDeResumen(filas, indiceEncabezado);

  it("opción A (default): una deuda por fila, agrupadas por cliente", () => {
    const resultado = normalizarFilasFiado({
      filas,
      indiceEncabezado,
      mapeo,
      consolidar: false,
      tasaResumen,
      tasaNegocio: 40,
    });

    expect(resultado.filas).toHaveLength(3);
    expect(resultado.clientesUnicosDetectados).toBe(2);
    expect(resultado.totalUsdEstimado).toBeCloseTo(83.8, 1);

    const primera = resultado.filas[0];
    expect(primera?.nombre).toBe("Juan Pérez");
    expect(primera?.monto).toBe(50);
    expect(primera?.moneda).toBe("USD");
    expect(primera?.fechaDeuda).toBe("2026-04-27");
    expect(primera?.nota).toBe("Estado origen: FIADO");
    expect(primera?.cedula).toBe("");

    const segunda = resultado.filas[1];
    expect(segunda?.nota).toBe("Estado origen: ABONADO");
    expect(segunda?.claveAgrupacion).toBe(primera?.claveAgrupacion);
  });

  it("opción B: consolida en una sola deuda por cliente, sumando en USD y con la fecha más antigua", () => {
    const resultado = normalizarFilasFiado({
      filas,
      indiceEncabezado,
      mapeo,
      consolidar: true,
      tasaResumen,
      tasaNegocio: 40,
    });

    expect(resultado.filas).toHaveLength(2);
    const juan = resultado.filas.find((f) => f.nombre === "Juan Pérez");
    expect(juan?.monto).toBeCloseTo(70, 1);
    expect(juan?.moneda).toBe("USD");
    expect(juan?.fechaDeuda).toBe("2026-03-10");
    expect(juan?.nota).toContain("Estado origen: FIADO");
    expect(juan?.nota).toContain("Estado origen: ABONADO");
  });

  it("omite filas sin nombre y las reporta como advertencia", () => {
    const filasConSinNombre = [...filas, ["", "01/01/2026", "FIADO", "15", "11133"]];
    const resultado = normalizarFilasFiado({
      filas: filasConSinNombre,
      indiceEncabezado,
      mapeo,
      consolidar: false,
      tasaResumen,
      tasaNegocio: 40,
    });
    expect(resultado.filas).toHaveLength(3);
    expect(resultado.filas.every((f) => f.nombre !== "")).toBe(true);
    expect(resultado.advertencias.some((a) => /sin nombre/i.test(a.mensaje))).toBe(true);
  });
});

describe("normalizarFilasFiado — plantilla canónica del sistema (no debe cambiar nada)", () => {
  const filas = [
    [
      "nombre",
      "cedula",
      "telefono",
      "whatsapp",
      "direccion",
      "limite_fiado_usd",
      "monto_adeudado",
      "moneda",
      "tasa",
      "fecha_deuda",
      "nota",
    ],
    [
      "Ana Gómez",
      "V12345678",
      "0414-1234567",
      "",
      "Av. Bolívar",
      "100",
      "25.50",
      "USD",
      "",
      "2026-05-01",
      "",
    ],
    ["Pedro Ruiz", "E87654321", "", "", "", "0", "1000", "Bs", "bcv", "", ""],
  ];

  it("produce exactamente los mismos valores que ya vienen en el archivo (paso transparente)", () => {
    const mapeo = detectarMapeoColumnas(filas[0] ?? []);
    const resultado = normalizarFilasFiado({
      filas,
      indiceEncabezado: 0,
      mapeo,
      consolidar: false,
      tasaResumen: null,
      tasaNegocio: 40,
    });

    expect(resultado.filas).toHaveLength(2);
    const ana = resultado.filas[0];
    expect(ana?.nombre).toBe("Ana Gómez");
    expect(ana?.cedula).toBe("V12345678");
    expect(ana?.monto).toBe(25.5);
    expect(ana?.moneda).toBe("USD");
    expect(ana?.fechaDeuda).toBe("2026-05-01");

    const pedro = resultado.filas[1];
    expect(pedro?.cedula).toBe("E87654321");
    expect(pedro?.monto).toBe(1000);
    expect(pedro?.moneda).toBe("Bs");
    expect(pedro?.tasa).toBe("bcv");
  });
});

describe("filasACsvCanonico", () => {
  it("arma el CSV en el orden posicional exacto que espera parseFilasFiado", () => {
    const filas = [
      ["Cliente", "Fecha", "Estado", "Pendiente $", "Pendiente Bs"],
      ["Juan Pérez", "27/04/2026 09:04 p. m.", "FIADO", "50", "37111"],
    ];
    const mapeo = detectarMapeoColumnas(filas[0] ?? []);
    const resultado = normalizarFilasFiado({
      filas,
      indiceEncabezado: 0,
      mapeo,
      consolidar: false,
      tasaResumen: 742.22,
      tasaNegocio: 40,
    });

    const csv = filasACsvCanonico(resultado.filas);
    const lineas = csv.split("\n");
    expect(lineas[0]).toBe(
      "nombre,cedula,telefono,whatsapp,direccion,limite_fiado_usd,monto_adeudado,moneda,tasa,fecha_deuda,nota",
    );
    const cols = lineas[1]?.split(",") ?? [];
    expect(cols[0]).toBe("Juan Pérez");
    expect(cols[6]).toBe("50");
    expect(cols[7]).toBe("USD");
    expect(cols[9]).toBe("2026-04-27");
  });

  it("escapa campos con comas o comillas", () => {
    const csv = filasACsvCanonico([
      {
        filaOrigen: 1,
        nombre: 'Bodega "El, Éxito"',
        cedula: "",
        telefono: "",
        whatsapp: "",
        direccion: "",
        limiteFiadoUsd: 0,
        monto: 10,
        moneda: "USD",
        tasa: "",
        fechaDeuda: "",
        nota: "",
        claveAgrupacion: "bodega el, exito",
        montoUsdEquivalente: 10,
      },
    ]);
    expect(csv).toContain('"Bodega ""El, Éxito"""');
  });
});
