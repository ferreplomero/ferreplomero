export const METODOS_PAGO_IDS = [
  "efectivo_bs",
  "efectivo_usd",
  "pago_movil",
  "transferencia",
  "zelle",
  "tarjeta",
  "cashea",
  "fiado",
] as const;

export type MetodoId = (typeof METODOS_PAGO_IDS)[number];

export interface MetodoPagoConfigItem {
  metodo: MetodoId;
  activo: boolean;
  banco?: string;
  telefono?: string;
  titular?: string;
  rif?: string;
  cuenta?: string;
  zelle_identificador?: string;
}

export const METODO_CAMPOS: Partial<
  Record<MetodoId, (keyof Omit<MetodoPagoConfigItem, "metodo" | "activo">)[]>
> = {
  pago_movil: ["banco", "telefono", "titular", "rif"],
  transferencia: ["banco", "cuenta", "titular", "rif"],
  zelle: ["zelle_identificador", "titular"],
  tarjeta: ["banco"],
};

export const METODO_META: Record<MetodoId, { label: string; descripcion: string }> = {
  efectivo_bs: {
    label: "Efectivo Bs",
    descripcion: "Pagos en bolívares en efectivo",
  },
  efectivo_usd: {
    label: "Efectivo USD",
    descripcion: "Dólares físicos. Aplica IGTF del 3 %",
  },
  pago_movil: {
    label: "Pago Móvil",
    descripcion: "Transferencia instantánea por número de teléfono",
  },
  transferencia: {
    label: "Transferencia bancaria",
    descripcion: "Depósito o transferencia a cuenta bancaria",
  },
  zelle: {
    label: "Zelle",
    descripcion: "Pago en USD por Zelle. Aplica IGTF del 3 %",
  },
  tarjeta: {
    label: "Tarjeta / Punto de venta",
    descripcion: "Pago con tarjeta débito o crédito",
  },
  cashea: {
    label: "Cashea",
    descripcion:
      "Compra ahora, paga después. El comerciante recibe el pago normal; el crédito lo gestiona la app de Cashea",
  },
  fiado: {
    label: "Fiado (crédito)",
    descripcion: "Crédito al cliente; queda registrado como deuda",
  },
};

export const CAMPO_LABEL: Record<string, string> = {
  banco: "Banco",
  telefono: "Número de teléfono",
  titular: "Nombre del titular",
  rif: "RIF o cédula del titular",
  cuenta: "Número de cuenta",
  zelle_identificador: "Email o teléfono Zelle",
};

export const CAMPO_PLACEHOLDER: Record<string, string> = {
  banco: "ej. Banco de Venezuela",
  telefono: "ej. 0412-1234567",
  titular: "Nombre completo",
  rif: "ej. J-12345678-9",
  cuenta: "ej. 01020123456789012345",
  zelle_identificador: "ej. pagos@ejemplo.com",
};

function getDefault(): MetodoPagoConfigItem[] {
  return METODOS_PAGO_IDS.map((id) => ({ metodo: id, activo: true }));
}

export function parseMetodosPago(raw: unknown): MetodoPagoConfigItem[] {
  if (!Array.isArray(raw) || raw.length === 0) return getDefault();

  const validIds = new Set<string>(METODOS_PAGO_IDS);
  const parsed = raw.filter(
    (m): m is MetodoPagoConfigItem =>
      m !== null &&
      typeof m === "object" &&
      typeof (m as Record<string, unknown>).metodo === "string" &&
      validIds.has((m as Record<string, unknown>).metodo as string),
  );

  const present = new Set(parsed.map((m) => m.metodo));
  for (const id of METODOS_PAGO_IDS) {
    if (!present.has(id)) parsed.push({ metodo: id, activo: true });
  }

  const order = Object.fromEntries(METODOS_PAGO_IDS.map((id, i) => [id, i]));
  return parsed.sort((a, b) => (order[a.metodo] ?? 99) - (order[b.metodo] ?? 99));
}

/**
 * ¿El negocio ya cargó datos reales de algún medio de pago que los necesita
 * (pago móvil, transferencia, Zelle, tarjeta)? `activo` viene en `true` por
 * defecto para todos (ver `getDefault`), así que no sirve para detectar
 * "aún no configurado" — lo que importa es si ya escribió banco/teléfono/
 * cuenta/titular/identificador en alguno. Efectivo y fiado no cuentan: no
 * requieren datos que compartir con el cliente.
 */
export function tieneMedioPagoConfigurado(metodos: MetodoPagoConfigItem[]): boolean {
  return metodos.some((m) => {
    const campos = METODO_CAMPOS[m.metodo];
    if (!campos || campos.length === 0) return false;
    return campos.some((campo) => {
      const valor = m[campo];
      return typeof valor === "string" && valor.trim().length > 0;
    });
  });
}
