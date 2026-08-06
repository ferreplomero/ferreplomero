/**
 * Abstracción de documento de venta. El recibo simple (hoy) y la futura factura
 * fiscal SENIAT serán implementaciones del MISMO modelo, para no incrustar
 * lógica fiscal en la UI. La UI del recibo solo consume `DocumentoFiscal`.
 */
import type { MmDocTipo, MmMetodoPago, MmPagoVenta, MmVenta, MmVentaItem } from "@arkiteq/db";

export interface LineaDocumento {
  descripcion: string;
  cantidad: number;
  precioUsd: number;
  totalUsd: number;
  /** true si el producto estaba marcado "Exento" de IVA al momento de la venta. */
  exenta: boolean;
}

export interface PagoDocumento {
  metodo: MmMetodoPago;
  monto: number;
  moneda: string;
}

/**
 * Qué pasó con el excedente de una venta (el cliente pagó de más). Solo
 * existe cuando REALMENTE hubo excedente y el cajero ya eligió qué hacer con
 * él — nunca se calcula aquí, solo se refleja lo que ya quedó registrado en
 * `mm_caja_movimientos` / `mm_cuenta_movimientos` / `mm_creditos_cliente`
 * (ver `getExcedenteVenta` en `data/ventas.ts`).
 */
export type ResolucionExcedente =
  | { tipo: "efectivo"; moneda: "USD" | "VES" }
  | { tipo: "banco"; metodo: MmMetodoPago; banco: string }
  | { tipo: "credito" };

export interface ExcedenteDocumento {
  montoUsd: number;
  montoBs: number;
  resolucion: ResolucionExcedente;
}

/**
 * Devolución de dinero registrada al anular la venta (ver
 * `anularVentaConDevolucion` en `data/ventas.ts`) — null cuando la venta
 * sigue vigente, o cuando fue anulada sin dinero real que devolver (venta
 * 100% fiada).
 */
export interface DevolucionDocumento {
  montoUsd: number;
  montoBs: number;
  metodo: MmMetodoPago;
  /** Nombre del banco/cuenta que emitió la devolución, null si fue en efectivo. */
  banco: string | null;
  fecha: string;
}

/** Datos del cliente para la sección "Cliente" del recibo. `telefono`/`direccion`
 * son opcionales porque `VentaDetalle` (vista interna) reutiliza este tipo con
 * un cliente más liviano (solo id/nombre/cedula, sin esos dos campos). */
export interface ClienteDocumento {
  nombre: string;
  cedula: string | null;
  telefono?: string | null;
  whatsapp?: string | null;
  direccion?: string | null;
}

export interface DocumentoFiscal {
  tipo: MmDocTipo;
  numero: string | null;
  fecha: string;
  negocio: { nombre: string; rif: string | null; direccion: string | null; logoUrl: string | null };
  /** "Mostrar encabezado de la empresa en los recibos" (Configuración) — si es
   * false, la UI del recibo no debe pintar el bloque de arriba (nombre, RIF,
   * dirección, logo) aunque `negocio` traiga los datos. */
  mostrarEncabezado: boolean;
  /** "Mostrar leyenda de comprobante interno" (Configuración) — si es false,
   * la UI del recibo no debe pintar `<LeyendaNoFiscal />`. Activado por
   * defecto; desactivarlo requiere confirmación explícita del usuario en
   * Configuración porque es un resguardo legal (SENIAT). */
  mostrarLeyenda: boolean;
  /** "Mostrar botón de enviar recibo por WhatsApp" (Configuración) — activado
   * por defecto. Controla si la UI del recibo pinta el botón de envío. */
  mostrarBotonWhatsapp: boolean;
  /** Link público de solo lectura del recibo (sin sesión) — el cliente lo abre
   * para ver su comprobante. Ver `lib/minimarket/recibo-link.ts`. */
  linkPublico: string;
  /** null = venta a cliente ocasional (sin cliente asignado). */
  cliente: ClienteDocumento | null;
  lineas: LineaDocumento[];
  subtotalUsd: number;
  igtfUsd: number;
  /** IVA cobrado en la venta, derivado (total − IGTF − subtotal). 0 si el
   * negocio no cobra IVA o si todo lo vendido estaba exento. */
  ivaUsd: number;
  totalUsd: number;
  totalBs: number;
  tasa: number;
  pagos: PagoDocumento[];
  /** null cuando el pago fue exacto (el caso normal, hoy) — el recibo no
   * cambia en nada respecto a como está ahora. */
  excedente: ExcedenteDocumento | null;
  /** 'completada' (default) en todos los documentos existentes — el banner
   * de anulada solo aparece cuando esto es 'anulada'. */
  estado: "completada" | "anulada";
  /** null salvo que la venta esté anulada y haya habido devolución real. */
  devolucion: DevolucionDocumento | null;
}

/** Construye el modelo de recibo simple a partir de los datos de la venta. */
export function construirRecibo(
  venta: Pick<
    MmVenta,
    | "tipo_documento"
    | "numero_documento"
    | "fecha"
    | "tasa_usada"
    | "subtotal_usd"
    | "igtf_usd"
    | "total_usd"
    | "total_bs"
  >,
  items: Pick<
    MmVentaItem,
    "descripcion" | "cantidad" | "precio_usd" | "total_usd" | "impuesto_id"
  >[],
  pagos: Pick<MmPagoVenta, "metodo" | "monto" | "moneda">[],
  negocio: { nombre: string; rif: string | null; direccion: string | null; logoUrl: string | null },
  mostrarEncabezado: boolean,
  cliente: ClienteDocumento | null,
  mostrarLeyenda: boolean,
  mostrarBotonWhatsapp: boolean,
  linkPublico: string,
  excedente: ExcedenteDocumento | null = null,
  estado: "completada" | "anulada" = "completada",
  devolucion: DevolucionDocumento | null = null,
): DocumentoFiscal {
  return {
    tipo: venta.tipo_documento,
    numero: venta.numero_documento,
    fecha: venta.fecha,
    negocio,
    mostrarEncabezado,
    mostrarLeyenda,
    mostrarBotonWhatsapp,
    linkPublico,
    cliente,
    lineas: items.map((i) => ({
      descripcion: i.descripcion,
      cantidad: Number(i.cantidad),
      precioUsd: Number(i.precio_usd),
      totalUsd: Number(i.total_usd),
      exenta: i.impuesto_id === "exento",
    })),
    subtotalUsd: Number(venta.subtotal_usd),
    igtfUsd: Number(venta.igtf_usd),
    // Derivado (mismo criterio que `ivaRegistradoUsd` en Finanzas): la venta
    // no guarda su propio `iva_usd`, así que se reconstruye a partir de lo
    // que sí quedó congelado. Ya excluye lo exento porque `total_usd` se
    // calculó (en `registrarVenta`) solo sobre la base gravada.
    ivaUsd: Math.max(
      0,
      Math.round(
        (Number(venta.total_usd) - Number(venta.igtf_usd) - Number(venta.subtotal_usd)) * 100,
      ) / 100,
    ),
    totalUsd: Number(venta.total_usd),
    totalBs: Number(venta.total_bs),
    tasa: Number(venta.tasa_usada),
    pagos: pagos.map((p) => ({ metodo: p.metodo, monto: Number(p.monto), moneda: p.moneda })),
    excedente,
    estado,
    devolucion,
  };
}
