/**
 * Normalizador de archivos de carga masiva de fiados que NO vienen en el
 * formato canónico del sistema (exports de otro POS/Excel del comercio:
 * filas de título arriba, encabezado en cualquier fila, columnas en
 * cualquier orden/nombre, 1 fila por deuda con el cliente repetido).
 *
 * Corre 100% en el navegador, ANTES de que exista el texto `csv` que ya
 * consume el flujo existente. Su única salida es texto CSV en el MISMO
 * formato posicional de siempre (`nombre,cedula,telefono,whatsapp,direccion,
 * limite_fiado_usd,monto_adeudado,moneda,tasa,fecha_deuda,nota`) — el mismo
 * que ya procesan `parseFilasFiado`/`previsualizarCargaFiados`/`cargaFiados`
 * en `app/(vertical)/minimarket/clientes/actions.ts`, SIN TOCAR ni una línea
 * de esas funciones ni sus validaciones (cédula, fecha, monto). Cuando este
 * módulo no puede resolver un campo con certeza, lo deja vacío — nunca
 * inventa un valor que haría que esa validación existente rechace la fila;
 * deja que el parser de siempre decida, igual que hoy.
 */

export type CampoCanonico =
  | "nombre"
  | "cedula"
  | "telefono"
  | "whatsapp"
  | "direccion"
  | "limite_fiado_usd"
  | "monto_usd"
  | "monto_bs"
  | "moneda"
  | "tasa"
  | "fecha_deuda"
  | "nota";

export const CAMPOS_CANONICOS: CampoCanonico[] = [
  "nombre",
  "cedula",
  "telefono",
  "whatsapp",
  "direccion",
  "limite_fiado_usd",
  "monto_usd",
  "monto_bs",
  "moneda",
  "tasa",
  "fecha_deuda",
  "nota",
];

export const CAMPO_LABEL: Record<CampoCanonico, string> = {
  nombre: "Nombre del cliente",
  cedula: "Cédula",
  telefono: "Teléfono",
  whatsapp: "WhatsApp",
  direccion: "Dirección",
  limite_fiado_usd: "Límite de fiado (USD)",
  monto_usd: "Monto adeudado en USD",
  monto_bs: "Monto adeudado en Bs",
  moneda: "Moneda (columna explícita)",
  tasa: "Tasa (columna explícita)",
  fecha_deuda: "Fecha de la deuda",
  nota: "Nota / descripción",
};

/** Sinónimos reconocidos por columna — comparados ya normalizados (ver `normalizarEncabezado`). */
const ALIAS_CAMPOS: Record<CampoCanonico, string[]> = {
  nombre: ["nombre", "cliente", "nombre del cliente", "cliente/nombre"],
  cedula: ["cedula", "ci", "documento", "rif", "identificacion"],
  telefono: ["telefono", "tlf", "telf", "celular", "contacto"],
  whatsapp: ["whatsapp", "wsp", "wpp", "wtsp"],
  direccion: ["direccion", "dir", "domicilio"],
  limite_fiado_usd: ["limite_fiado_usd", "limite", "limite de credito", "cupo", "limite fiado"],
  monto_usd: [
    "monto_adeudado",
    "pendiente $",
    "pendiente usd",
    "deuda $",
    "saldo $",
    "total $",
    "monto usd",
  ],
  monto_bs: ["pendiente bs", "deuda bs", "saldo bs", "monto bs", "total bs"],
  moneda: ["moneda"],
  tasa: ["tasa"],
  fecha_deuda: ["fecha_deuda", "fecha"],
  nota: ["nota", "descripcion", "observacion", "detalle", "estado"],
};

/** Campos "fuertes": basta con detectar UNO de estos en una fila para asumir
 * que esa fila es el encabezado real (spec: "nombre/cliente, o cédula, o
 * algún monto/pendiente"). */
const CAMPOS_FUERTES: CampoCanonico[] = ["nombre", "cedula", "monto_usd", "monto_bs"];

/** Minúsculas, sin acentos, "$" convertido a la palabra "usd" (para no perder
 * la señal de moneda al limpiar signos), resto de la puntuación colapsada a
 * espacios. Nombre de columna y alias se comparan siempre ya normalizados. */
export function normalizarEncabezado(valor: string): string {
  return valor
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\$/g, " usd ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Mismo criterio que `normalizarTexto` en `clientes/actions.ts` (duplicado
 * aquí porque ese archivo es "use server" y este módulo corre en el navegador). */
function normalizarTexto(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

const CAMPO_POR_ALIAS = new Map<string, CampoCanonico>();
for (const campo of CAMPOS_CANONICOS) {
  for (const alias of ALIAS_CAMPOS[campo]) {
    CAMPO_POR_ALIAS.set(normalizarEncabezado(alias), campo);
  }
}

export interface ColumnaDetectada {
  indice: number | null;
  /** Encabezado tal como venía en el archivo — para mostrarlo en la UI y
   * decidir si el campo `nota` vino del alias "estado" (formato especial). */
  encabezadoOriginal: string | null;
}

export type MapeoColumnas = Record<CampoCanonico, ColumnaDetectada>;

function mapeoVacio(): MapeoColumnas {
  const mapeo = {} as MapeoColumnas;
  for (const campo of CAMPOS_CANONICOS) mapeo[campo] = { indice: null, encabezadoOriginal: null };
  return mapeo;
}

/**
 * Escanea las primeras ~15 filas y devuelve la primera que tenga al menos un
 * campo "fuerte" reconocible. Si ninguna filas del rango matchea, cae a la
 * fila 0 (`automatica: false`, para que la UI avise que hay que revisar el
 * mapeo a mano).
 */
export function detectarFilaEncabezado(filas: unknown[][]): {
  indice: number;
  automatica: boolean;
} {
  const limite = Math.min(15, filas.length);
  for (let i = 0; i < limite; i++) {
    const fila = filas[i] ?? [];
    const tieneCampoFuerte = fila.some((celda) => {
      const campo = CAMPO_POR_ALIAS.get(normalizarEncabezado(celda == null ? "" : String(celda)));
      return campo != null && CAMPOS_FUERTES.includes(campo);
    });
    if (tieneCampoFuerte) return { indice: i, automatica: true };
  }
  return { indice: 0, automatica: false };
}

/** A partir de la fila de encabezado (celdas crudas), arma el mapeo
 * campo→columna. Primera coincidencia gana si dos columnas apuntan al mismo
 * campo (encabezado repetido). */
export function detectarMapeoColumnas(filaEncabezado: unknown[]): MapeoColumnas {
  const mapeo = mapeoVacio();
  filaEncabezado.forEach((celdaRaw, indice) => {
    const original = celdaRaw == null ? "" : String(celdaRaw).trim();
    if (!original) return;
    const campo = CAMPO_POR_ALIAS.get(normalizarEncabezado(original));
    if (!campo) return;
    if (mapeo[campo].indice == null) {
      mapeo[campo] = { indice, encabezadoOriginal: original };
    }
  });
  return mapeo;
}

/** "742.23" o "742,23" → 742.23. Si trae ambos separadores, el que aparece
 * último se toma como decimal (mismo criterio con el que la mayoría de
 * exports latinoamericanos mezclan miles/decimales). */
function normalizarNumeroTexto(raw: string): number | null {
  const limpio = raw.trim();
  if (!limpio) return null;
  const ultimaComa = limpio.lastIndexOf(",");
  const ultimoPunto = limpio.lastIndexOf(".");
  const normalizado =
    ultimaComa > ultimoPunto
      ? limpio.replace(/\./g, "").replace(",", ".")
      : limpio.replace(/,/g, "");
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

/** Quita símbolos de moneda/espacios de una celda y devuelve el número, o
 * `null` si la celda está vacía o no se puede interpretar como monto. */
export function limpiarMonto(valor: unknown): number | null {
  if (valor == null) return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  const texto = String(valor).trim();
  if (!texto) return null;
  const soloNumero = texto.replace(/[^\d.,-]/g, "");
  if (!soloNumero) return null;
  return normalizarNumeroTexto(soloNumero);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Busca en las filas ANTES del encabezado un texto tipo "Tasa BCV usada:
 * 742.22 Bs/$" y devuelve el número, o `null` si no aparece (opcional). */
export function extraerTasaDeResumen(filas: unknown[][], hastaFila: number): number | null {
  const texto = filas
    .slice(0, Math.max(0, hastaFila))
    .flat()
    .map((c) => (c == null ? "" : String(c)))
    .join(" ");
  const match = texto.match(/tasa[^0-9]{0,20}(\d[\d.,]*)\s*bs/i);
  if (!match?.[1]) return null;
  return limpiarMonto(match[1]);
}

const CEDULA_REGEX = /^[VEJG]\d{6,9}$/;

/** Acepta el formato canónico tal cual (V/E/J/G+dígitos). Si son solo
 * dígitos (6-9, largo típico de cédula venezolana) antepone "V" — el caso
 * mayoritario — y lo marca como `ajustada` para avisar en la vista previa.
 * Cualquier otra cosa se deja vacía: nunca se manda un valor que haría que
 * la validación existente (`CEDULA_REGEX` en `clientes/actions.ts`) rechace
 * la fila completa. */
export function resolverCedula(valor: unknown): { cedula: string; ajustada: boolean } {
  if (valor == null) return { cedula: "", ajustada: false };
  const texto = String(valor)
    .trim()
    .toUpperCase()
    .replace(/[\s.-]/g, "");
  if (!texto) return { cedula: "", ajustada: false };
  if (CEDULA_REGEX.test(texto)) return { cedula: texto, ajustada: false };
  if (/^\d{6,9}$/.test(texto)) return { cedula: `V${texto}`, ajustada: true };
  return { cedula: "", ajustada: false };
}

/** "AAAA-MM-DD", "DD/MM/AAAA" o "DD/MM/AAAA hh:mm a. m./p. m." → "AAAA-MM-DD"
 * (formato que ya acepta `parseFilasFiado` sin cambios). Si no se reconoce,
 * devuelve "" — el parser existente ya trata una fecha vacía como "usar hoy",
 * nunca como error. */
export function parsearFechaFlexible(valor: unknown): string {
  if (valor == null) return "";
  const texto = String(valor).trim();
  if (!texto) return "";
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy?.[1] && dmy[2] && dmy[3]) {
    const dia = Number(dmy[1]);
    const mes = Number(dmy[2]);
    const anio = Number(dmy[3]);
    if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31) {
      return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    }
  }
  return "";
}

interface ResolucionMonto {
  /** Lo que va a la columna `monto_adeudado` del CSV canónico. */
  montoCanonico: number;
  /** Lo que va a la columna `moneda` del CSV canónico. */
  monedaCanonica: "USD" | "Bs";
  /** Lo que va a la columna `tasa` del CSV canónico (tipo bcv/euro/manual, o ""). */
  tasaCanonica: string;
  /** Mejor estimado en USD — solo para la vista previa/consolidación de ESTE
   * módulo, nunca se manda tal cual salvo que ya coincida con montoCanonico. */
  montoUsdEquivalente: number;
}

/**
 * Decide moneda/monto/tasa de una fila. USD siempre gana si viene con valor
 * (nunca se suma USD + Bs — son el mismo monto en dos monedas). Si solo hay
 * Bs y la fila trae una columna de tasa-tipo (bcv/euro/manual), se deja
 * pasar tal cual — el parser EXISTENTE convierte con la tasa REGISTRADA del
 * negocio, mismo camino de siempre, cero cálculo nuevo. Solo cuando hay Bs
 * SIN columna de tasa-tipo (el caso real de un export ajeno) este módulo
 * convierte él mismo, con la tasa detectada en el resumen del archivo o, si
 * no hay, la tasa vigente del negocio — y emite USD ya convertido.
 */
export function resolverMontoMoneda(
  montoUsdCelda: unknown,
  montoBsCelda: unknown,
  tasaCelda: unknown,
  tasaResumen: number | null,
  tasaNegocio: number | null,
): ResolucionMonto {
  const montoUsd = limpiarMonto(montoUsdCelda);
  if (montoUsd != null && montoUsd > 0) {
    return {
      montoCanonico: montoUsd,
      monedaCanonica: "USD",
      tasaCanonica: "",
      montoUsdEquivalente: montoUsd,
    };
  }

  const montoBs = limpiarMonto(montoBsCelda);
  if (montoBs != null && montoBs > 0) {
    const tasaTexto = tasaCelda == null ? "" : String(tasaCelda).trim();
    if (tasaTexto) {
      const tasaAprox = tasaResumen ?? tasaNegocio;
      return {
        montoCanonico: montoBs,
        monedaCanonica: "Bs",
        tasaCanonica: tasaTexto,
        montoUsdEquivalente: tasaAprox && tasaAprox > 0 ? round2(montoBs / tasaAprox) : 0,
      };
    }

    const tasaUsar = tasaResumen ?? tasaNegocio;
    if (tasaUsar && tasaUsar > 0) {
      const usd = round2(montoBs / tasaUsar);
      return {
        montoCanonico: usd,
        monedaCanonica: "USD",
        tasaCanonica: "",
        montoUsdEquivalente: usd,
      };
    }

    // Sin ninguna tasa disponible: se deja en Bs sin tasa-tipo — el parser
    // existente usará la tasa preferida del negocio al momento de importar.
    return {
      montoCanonico: montoBs,
      monedaCanonica: "Bs",
      tasaCanonica: "",
      montoUsdEquivalente: 0,
    };
  }

  return { montoCanonico: 0, monedaCanonica: "USD", tasaCanonica: "", montoUsdEquivalente: 0 };
}

export interface FilaFiadoNormalizada {
  /** Número de fila tal como se ve en el Excel (1-based), para las advertencias. */
  filaOrigen: number;
  nombre: string;
  cedula: string;
  telefono: string;
  whatsapp: string;
  direccion: string;
  limiteFiadoUsd: number;
  monto: number;
  moneda: "USD" | "Bs";
  tasa: string;
  fechaDeuda: string;
  nota: string;
  /** Cédula si hay, si no nombre normalizado — para agrupar por cliente. */
  claveAgrupacion: string;
  montoUsdEquivalente: number;
}

export interface AdvertenciaNormalizacion {
  fila: number;
  mensaje: string;
}

export interface ResultadoNormalizacion {
  filas: FilaFiadoNormalizada[];
  advertencias: AdvertenciaNormalizacion[];
  clientesUnicosDetectados: number;
  totalUsdEstimado: number;
}

function celda(fila: unknown[], mapeo: MapeoColumnas, campo: CampoCanonico): unknown {
  const indice = mapeo[campo].indice;
  return indice == null ? undefined : fila[indice];
}

function textoCelda(fila: unknown[], mapeo: MapeoColumnas, campo: CampoCanonico): string {
  const valor = celda(fila, mapeo, campo);
  return valor == null ? "" : String(valor).trim();
}

/**
 * Convierte las filas crudas del archivo (desde `indiceEncabezado + 1` hasta
 * el final) en filas normalizadas, listas para volverse CSV canónico. Nunca
 * lanza por una fila individual mal formada — la reporta en `advertencias`
 * (si le falta el nombre, se omite; el resto de validaciones las hace el
 * parser existente cuando reciba el CSV).
 */
export function normalizarFilasFiado(params: {
  filas: unknown[][];
  indiceEncabezado: number;
  mapeo: MapeoColumnas;
  consolidar: boolean;
  tasaResumen: number | null;
  tasaNegocio: number | null;
}): ResultadoNormalizacion {
  const { filas, indiceEncabezado, mapeo, consolidar, tasaResumen, tasaNegocio } = params;
  const advertencias: AdvertenciaNormalizacion[] = [];
  const filasValidas: FilaFiadoNormalizada[] = [];
  const vistas = new Set<string>();

  const encabezadoNotaEsEstado =
    mapeo.nota.encabezadoOriginal != null &&
    normalizarEncabezado(mapeo.nota.encabezadoOriginal) === "estado";

  for (let i = indiceEncabezado + 1; i < filas.length; i++) {
    const fila = filas[i] ?? [];
    const vacia = fila.every((c) => c == null || String(c).trim() === "");
    if (vacia) continue;

    const filaOrigen = i + 1;
    const nombre = textoCelda(fila, mapeo, "nombre");
    if (!nombre) {
      advertencias.push({ fila: filaOrigen, mensaje: "Sin nombre — se omite esta fila." });
      continue;
    }

    const cedulaCeldaRaw = celda(fila, mapeo, "cedula");
    const { cedula, ajustada } = resolverCedula(cedulaCeldaRaw);
    const cedulaTexto = cedulaCeldaRaw == null ? "" : String(cedulaCeldaRaw).trim();
    if (ajustada) {
      advertencias.push({
        fila: filaOrigen,
        mensaje: `Cédula "${cedulaTexto}" ajustada a ${cedula} (se asumió Venezuela) — revísala si no corresponde.`,
      });
    } else if (cedulaTexto && !cedula) {
      advertencias.push({
        fila: filaOrigen,
        mensaje: `Cédula "${cedulaTexto}" no reconocida — se importará sin cédula (se agrupará por nombre).`,
      });
    }

    const telefono = textoCelda(fila, mapeo, "telefono");
    const whatsapp = textoCelda(fila, mapeo, "whatsapp");
    const direccion = textoCelda(fila, mapeo, "direccion");
    const limiteFiadoUsd = limpiarMonto(celda(fila, mapeo, "limite_fiado_usd")) ?? 0;

    // Formato canónico: una sola columna de monto ("monto_adeudado") más una
    // columna "moneda" aparte que dice si ese monto es USD o Bs (nunca hay
    // columna monto_bs separada en ese caso). Si la columna moneda dice "bs",
    // el valor de monto_usd en realidad está en bolívares — se reinterpreta
    // antes de resolver, para no perder la señal que ya traía el archivo.
    const monedaExplicita = textoCelda(fila, mapeo, "moneda").toLowerCase();
    let montoUsdCelda = celda(fila, mapeo, "monto_usd");
    let montoBsCelda = celda(fila, mapeo, "monto_bs");
    if (mapeo.moneda.indice != null && mapeo.monto_bs.indice == null && monedaExplicita === "bs") {
      montoBsCelda = montoUsdCelda;
      montoUsdCelda = null;
    }

    const resolucionMonto = resolverMontoMoneda(
      montoUsdCelda,
      montoBsCelda,
      celda(fila, mapeo, "tasa"),
      tasaResumen,
      tasaNegocio,
    );

    const fechaCeldaRaw = celda(fila, mapeo, "fecha_deuda");
    const fechaDeuda = parsearFechaFlexible(fechaCeldaRaw);
    const fechaTexto = fechaCeldaRaw == null ? "" : String(fechaCeldaRaw).trim();
    if (fechaTexto && !fechaDeuda) {
      advertencias.push({
        fila: filaOrigen,
        mensaje: `Fecha "${fechaTexto}" no reconocida — se usará la fecha de hoy.`,
      });
    }

    const notaOrigen = textoCelda(fila, mapeo, "nota");
    const nota = notaOrigen
      ? encabezadoNotaEsEstado
        ? `Estado origen: ${notaOrigen}`
        : notaOrigen
      : "";

    const claveAgrupacion = cedula || normalizarTexto(nombre);

    const claveDuplicado = `${claveAgrupacion}|${resolucionMonto.montoCanonico}|${fechaDeuda}`;
    if (resolucionMonto.montoCanonico > 0) {
      if (vistas.has(claveDuplicado)) {
        advertencias.push({
          fila: filaOrigen,
          mensaje: `Posible fila duplicada (mismo cliente, monto y fecha que otra fila).`,
        });
      }
      vistas.add(claveDuplicado);
    }

    filasValidas.push({
      filaOrigen,
      nombre,
      cedula,
      telefono,
      whatsapp,
      direccion,
      limiteFiadoUsd,
      monto: resolucionMonto.montoCanonico,
      moneda: resolucionMonto.monedaCanonica,
      tasa: resolucionMonto.tasaCanonica,
      fechaDeuda,
      nota,
      claveAgrupacion,
      montoUsdEquivalente: resolucionMonto.montoUsdEquivalente,
    });
  }

  const clientesUnicosDetectados = new Set(filasValidas.map((f) => f.claveAgrupacion)).size;
  const totalUsdEstimado = round2(filasValidas.reduce((s, f) => s + f.montoUsdEquivalente, 0));

  const filasFinal = consolidar ? consolidarPorCliente(filasValidas) : filasValidas;

  return { filas: filasFinal, advertencias, clientesUnicosDetectados, totalUsdEstimado };
}

/** Agrupa por `claveAgrupacion` en una sola fila por cliente: suma en USD
 * (usando `montoUsdEquivalente`, ya resuelto por fila), fecha = la más
 * antigua del grupo, notas concatenadas sin repetir. Siempre emite USD —
 * sumar montos que llegaron en Bs con distinta tasa/tipo por fila no se
 * puede "pasar tal cual" a una sola fila canónica. */
function consolidarPorCliente(filas: FilaFiadoNormalizada[]): FilaFiadoNormalizada[] {
  const grupos = new Map<string, FilaFiadoNormalizada[]>();
  for (const fila of filas) {
    const grupo = grupos.get(fila.claveAgrupacion) ?? [];
    grupo.push(fila);
    grupos.set(fila.claveAgrupacion, grupo);
  }

  const resultado: FilaFiadoNormalizada[] = [];
  for (const grupo of grupos.values()) {
    const primero = grupo[0];
    if (!primero) continue;
    const totalUsd = round2(grupo.reduce((s, f) => s + f.montoUsdEquivalente, 0));
    const fechasValidas = grupo
      .map((f) => f.fechaDeuda)
      .filter((f) => f !== "")
      .sort();
    const fechaMasAntigua = fechasValidas[0] ?? "";
    const notas = [...new Set(grupo.map((f) => f.nota).filter((n) => n !== ""))].join(" | ");
    const limiteFiadoUsd = Math.max(...grupo.map((f) => f.limiteFiadoUsd));

    resultado.push({
      ...primero,
      limiteFiadoUsd,
      monto: totalUsd,
      moneda: "USD",
      tasa: "",
      fechaDeuda: fechaMasAntigua,
      nota: notas,
      montoUsdEquivalente: totalUsd,
    });
  }
  return resultado;
}

function escaparCampoCsv(valor: string | number): string {
  const texto = String(valor);
  return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** Arma el texto CSV canónico final — mismo orden/escapado que ya espera
 * `parseCsvLineFiado` en `clientes/actions.ts` (sin tocarlo). */
export function filasACsvCanonico(filas: FilaFiadoNormalizada[]): string {
  const encabezado = [
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
  ];
  const lineas = filas.map((f) =>
    [
      f.nombre,
      f.cedula,
      f.telefono,
      f.whatsapp,
      f.direccion,
      f.limiteFiadoUsd,
      f.monto,
      f.moneda,
      f.tasa,
      f.fechaDeuda,
      f.nota,
    ]
      .map(escaparCampoCsv)
      .join(","),
  );
  return [encabezado.join(","), ...lineas].join("\n");
}
