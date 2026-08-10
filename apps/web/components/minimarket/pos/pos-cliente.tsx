"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Clock3,
  CreditCard,
  ImageIcon,
  Minus,
  Pencil,
  Plus,
  Scan,
  Search,
  ShoppingCart,
  Trash2,
  UserCheck,
  Wallet,
  WifiOff,
  X,
  PlusCircle,
} from "lucide-react";
import {
  Button,
  Card,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  WhatsAppIcon,
  toast,
} from "@arkiteq/ui";
import { PowerSyncContext } from "@powersync/react";
import { registrarVenta } from "@/app/(vertical)/minimarket/ventas/actions";
import {
  liberarReservaPresupuesto,
  marcarPresupuestoConvertido,
  reservarConversionPresupuesto,
} from "@/app/(vertical)/minimarket/presupuestos/actions";
import { METODOS_PAGO } from "@/lib/minimarket/constants";
import { formatMaskedAmount, parseMaskedInput } from "@/lib/minimarket/currency-mask";
import {
  calcularExcedenteBs,
  calcularMontoSaldo,
  computeCobro,
  esLineaExenta,
  recalcularPagosPorTasa,
  subtotalNetoGravado,
  subtotalNetoSujetoIgtf,
} from "@/lib/minimarket/pos-calc";
import { registrarVentaLocal } from "@/lib/minimarket/powersync/registrar-venta-local";
import {
  eliminarVentaPendienteLocal,
  guardarVentaPendienteLocal,
  obtenerVentaPendienteLocal,
  parseCarritoPendiente,
  parsePagosPendiente,
  type EstadoVentaPendiente,
  type VentaPendienteRow,
} from "@/lib/minimarket/powersync/ventas-pendientes-local";
import { useOnline } from "@/lib/minimarket/use-online";
import { reintentar } from "@/lib/minimarket/reintentar";
import {
  guardarEnOutbox,
  leerOutbox,
  quitarDeOutbox,
  type OutboxEntrada,
} from "@/lib/minimarket/pos-outbox";
import { CrearClienteModal, type ClienteCreadoPos } from "./crear-cliente-modal-cargador";
import { BotonCalculadora, CalculadoraModal } from "./calculadora-modal";
import {
  DialogoDejarEnEspera,
  VentasEnEsperaBoton,
  type VentaPendienteParaRetomar,
} from "./ventas-en-espera";
import { esTipoTasa, TIPO_TASA_LABEL, type TipoTasa } from "@/lib/minimarket/exchange-rate";
import {
  METODO_META,
  type MetodoId,
  type MetodoPagoConfigItem,
} from "@/lib/minimarket/metodos-pago";
import {
  esMetodoConCuenta,
  esMetodoVueltoDigital,
  METODO_CUENTA_LABEL,
} from "@/lib/minimarket/bancos";
import type { ProductoConStock } from "@/lib/minimarket/data/inventario";
import type { MmCuentaBancaria, MmMetodoPago } from "@arkiteq/db";

interface ClienteResumen {
  id: string;
  nombre: string;
  cedula: string | null;
  telefono: string | null;
  whatsapp: string | null;
  limite_fiado_usd: number;
  saldo_usd: number;
  /** Saldo a favor del cliente (excedente acreditado en una venta anterior). */
  saldo_favor_usd: number;
}

/** Métodos para los que tiene sentido enviar datos de pago por WhatsApp. */
const METODOS_CON_DATOS_PAGO = new Set<MmMetodoPago>(["pago_movil", "transferencia", "zelle"]);

/**
 * Identidad de marca de Cashea (negro + amarillo) en el selector de forma de
 * pago — para que se note de un vistazo cuál fila está cobrando por esa vía,
 * sin romper la apariencia neutra del resto de los métodos.
 */
const CASHEA_LOGO_SRC = "/cashea-logo.png";
const CASHEA_CLASSES =
  "bg-black text-[#FFCC00] focus:bg-black focus:text-[#FFCC00] data-[disabled]:opacity-40 [&_svg]:text-[#FFCC00]";

export interface PosClienteProps {
  productos: ProductoConStock[];
  frecuentesIds: string[];
  /** Valor de la tasa preseleccionada (la que usa todo el sistema por defecto). */
  tasa: number | null;
  /** Las 3 tasas vigentes en paralelo, para el selector del diálogo de cobro. */
  tasas: Record<TipoTasa, number | null>;
  fuentePreferida: TipoTasa;
  locale: string;
  sucursalId: string | null;
  clientes: ClienteResumen[];
  igtfActivo?: boolean;
  ivaActivo?: boolean;
  ivaPct?: number;
  /** Requeridos para poder registrar la venta en local si se pierde la conexión. */
  tenantId: string;
  usuarioId: string;
  /** Datos de pago móvil/transferencia/Zelle configurados en Configuración, para el botón de WhatsApp. */
  metodosPago: MetodoPagoConfigItem[];
  nombreComercial: string;
  /** Cuentas bancarias activas (pago móvil/transferencia/tarjeta) para elegir a
   * cuál entra un pago digital, o por cuál devolver el vuelto. Solo aplica
   * online — ver `offline` más abajo. */
  cuentasBancarias?: MmCuentaBancaria[];
  /** Permiso `ventas.editar` del usuario actual — controla si puede ajustar
   * el precio de un producto solo para esta venta (sin tocar el catálogo).
   * Resuelto en el servidor; nunca se confía en el cliente para esto. */
  puedeAjustarPrecio?: boolean;
  /**
   * Presente SOLO cuando se llega desde "Convertir en venta" de un
   * presupuesto (`?presupuestoId=` en `ventas/nueva/page.tsx`) — precarga el
   * carrito con sus productos/cantidades/precios pactados y deja que el
   * cajero cobre por el camino normal (sin tocar `confirmarVenta`,
   * `computeCobro` ni el diálogo de cobro). Conversión solo online: ver uso
   * más abajo.
   */
  presupuestoInicial?: {
    id: string;
    clienteId: string | null;
    notas: string | null;
    tasaTipo: TipoTasa;
    items: {
      productoId: string;
      cantidad: number;
      precioAjustadoUsd?: number;
      motivoAjustePrecio?: string;
    }[];
  } | null;
  /** Aviso informativo (nunca bloqueante) de ítems del presupuesto cuyo stock
   * actual ya no alcanza para la cantidad cotizada — mismo criterio "nunca
   * bloquea, solo informa" que ya rige el resto del POS. */
  avisosStockPresupuesto?: { nombre: string; cantidadPedida: number; stockActual: number }[];
}

interface VentaOfflineGuardada {
  numeroDocumento: string;
  totalUsd: number;
  totalBs: number;
}

interface LineaCarrito {
  producto: ProductoConStock;
  cantidad: number;
  /** Precio unitario puntual para ESTA venta (no toca `producto.precio_usd`
   * del inventario). `undefined` = precio normal del catálogo, igual que hoy. */
  precioAjustadoUsd?: number;
  /** Motivo opcional que escribió el cajero al ajustar el precio. */
  motivoAjustePrecio?: string;
  /** Override puntual de IVA para ESTA línea de ESTA venta (toggle del
   * carrito) — `undefined` = usa el estado guardado del producto
   * (`producto.impuesto_id !== "exento"`), igual que siempre. Nunca toca
   * `mm_productos` ni la config del negocio. */
  ivaOverride?: boolean;
  /** Override puntual de IGTF para ESTA línea de ESTA venta — `undefined` =
   * usa `producto.aplica_igtf`, igual que siempre. */
  igtfOverride?: boolean;
}

/** Precio unitario efectivo de una línea: el ajustado si existe, si no el de catálogo. */
function precioUnitarioLinea(l: LineaCarrito): number {
  return l.precioAjustadoUsd ?? Number(l.producto.precio_usd);
}

/** ¿Esta línea lleva IVA en ESTA venta? Override puntual si existe, si no el
 * estado guardado del producto. */
function lineaAplicaIva(l: LineaCarrito): boolean {
  return l.ivaOverride ?? !esLineaExenta(l.producto.impuesto_id);
}

/** ¿Esta línea causa IGTF en ESTA venta? Override puntual si existe, si no el
 * estado guardado del producto. */
function lineaAplicaIgtf(l: LineaCarrito): boolean {
  return l.igtfOverride ?? l.producto.aplica_igtf;
}

/** `impuesto_id` EFECTIVO de una línea para esta venta (folding del override
 * de IVA, si lo hay) — se usa como entrada de `subtotalNetoGravado`, que solo
 * distingue `"exento"` de cualquier otro valor, sin tocar esa función. */
function impuestoIdEfectivoLinea(l: LineaCarrito): string {
  if (!lineaAplicaIva(l)) return "exento";
  return l.producto.impuesto_id === "exento" ? "iva" : l.producto.impuesto_id;
}

interface PagoRow {
  key: string;
  metodo: MmMetodoPago;
  monto: string;
  /** true si el monto lo puso el sistema para cubrir el saldo (botón "← saldo"
   * o el pre-llenado inicial del diálogo de cobro) — debe seguir la tasa si
   * esta cambia. false/undefined si el cajero tecleó un monto físico a mano. */
  autoSaldo?: boolean;
  /** Cuenta bancaria del negocio que recibe este pago (solo pago_movil/
   * transferencia/tarjeta) — null si el método no aplica o no hay cuentas configuradas. */
  cuentaBancariaId?: string | null;
}

const SELECT_CLASS =
  "border-border bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2";

// BarcodeDetector Web API (Chrome 83+, Edge 83+; not in TypeScript stdlib)
interface BarcodeDetectionResult {
  rawValue: string;
}
interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): {
    detect(image: HTMLVideoElement): Promise<BarcodeDetectionResult[]>;
  };
}

function monedaDe(metodo: MmMetodoPago): "USD" | "VES" | "credit" {
  if (metodo === "fiado") return "credit";
  if (metodo === "credito_cliente") return "USD";
  const info = METODOS_PAGO.find((m) => m.value === metodo);
  if (info?.moneda === "USD") return "USD";
  return "VES";
}

let rowCounter = 0;
function newKey() {
  return `pago-${++rowCounter}`;
}

/** Clave de localStorage donde vive el id del borrador activo de este dispositivo. */
function claveCartIdStorage(tenantId: string): string {
  return `arkiteq_mm_pos_cart_id_${tenantId}`;
}

/**
 * Beep breve de confirmación al escanear (Web Audio API, sin archivo de
 * sonido externo — funciona offline). Feedback rápido para que el cajero
 * confirme que el producto se agregó sin tener que mirar la pantalla entre
 * un escaneo y el siguiente.
 */
function reproducirBeepEscaneo() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 1000;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => void ctx.close();
  } catch {
    // Sin soporte de Web Audio: no interrumpe el flujo, solo no habra sonido.
  }
}

/** Largo minimo de una rafaga para tratarla como codigo escaneado (evita que
 * una sola tecla suelta dispare un "agregar" accidental). Los SKU internos
 * autogenerados tienen 7 caracteres (ver `generarSku`) y los codigos de
 * barra reales (EAN/UPC) tienen 8-13 digitos, asi que 4 es un piso seguro. */
const LARGO_MINIMO_CODIGO_ESCANEADO = 4;
/** Si pasan mas de esto (ms) desde la primera tecla de la rafaga actual sin
 * que llegue un Enter, se descarta y arranca una rafaga nueva — evita que
 * una sesion de tecleo humano lento se acumule para siempre en el buffer. Es
 * deliberadamente generoso (no es el umbral que distingue lector de persona,
 * ver RITMO_PROMEDIO_MAX_MS abajo). */
const RAFAGA_MAX_DURACION_MS = 800;
/** Ritmo promedio maximo (ms por caracter, del primer caracter al Enter) para
 * tratar la rafaga como un lector fisico USB. Se mide en PROMEDIO sobre toda
 * la rafaga (no el gap entre cada par de teclas) a propósito: si se midiera
 * tecla a tecla, un solo frame lento del hilo principal (ej. una imagen del
 * carrito decodificando, un re-render pesado) alcanza para que ESE gap
 * puntual supere el umbral y tire todo el buffer acumulado hasta ahi,
 * apareciendo como "el lector dejo de funcionar" sin que el lector haya
 * fallado en absoluto — el promedio total absorbe un frame lento ocasional
 * sin perder la rafaga completa. Un lector USB tipico entrega cada caracter
 * en pocos ms; una persona escribiendo a mano promedia bastante mas de
 * 100ms/caracter incluso escribiendo rapido, asi que 60ms deja margen de
 * sobra sin abrir la puerta a tecleo humano. */
const RITMO_PROMEDIO_MAX_MS = 60;

export function PosCliente({
  productos,
  frecuentesIds,
  tasa,
  tasas,
  fuentePreferida,
  locale,
  sucursalId,
  clientes: clientesIniciales,
  igtfActivo = true,
  ivaActivo = false,
  ivaPct = 0,
  tenantId,
  usuarioId,
  metodosPago,
  nombreComercial,
  cuentasBancarias = [],
  puedeAjustarPrecio = false,
  presupuestoInicial = null,
  avisosStockPresupuesto = [],
}: PosClienteProps) {
  const router = useRouter();
  const powerSyncDb = React.useContext(PowerSyncContext);
  // Métodos que el negocio tiene ACTIVOS ahora mismo en Configuración > Métodos
  // de pago. El selector de la venta debe mostrar SOLO estos — antes mostraba
  // el catálogo completo (`METODOS_PAGO`) sin filtrar por el estado
  // activo/inactivo, así que un método desactivado seguía apareciendo como
  // opción de cobro.
  const metodosActivosSet = React.useMemo(
    () => new Set<MmMetodoPago>(metodosPago.filter((m) => m.activo).map((m) => m.metodo)),
    [metodosPago],
  );
  const metodosPagoActivos = React.useMemo(
    () => METODOS_PAGO.filter((m) => metodosActivosSet.has(m.value)),
    [metodosActivosSet],
  );
  // Método por defecto para una fila de pago nueva: efectivo Bs si sigue
  // activo (el caso normal — regla 14 de CLAUDE.md), o si el negocio lo
  // desactivó, el primer método activo que le quede configurado.
  const metodoPorDefecto: MmMetodoPago = metodosActivosSet.has("efectivo_bs")
    ? "efectivo_bs"
    : (metodosPagoActivos[0]?.value ?? "efectivo_bs");
  // Fiado ya otorgado offline esta sesión, por cliente: el saldo cacheado del
  // cliente no se entera de ventas locales aún no sincronizadas.
  const fiadoOfflineRef = React.useRef<Map<string, number>>(new Map());
  const [ventaOffline, setVentaOffline] = React.useState<VentaOfflineGuardada | null>(null);

  // Lista de clientes mutable: además de lo que trae el servidor, incluye los
  // creados EN VIVO desde esta misma venta (modal "Crear cliente nuevo"), para
  // que aparezcan y queden seleccionables sin recargar la página.
  const [clientes, setClientes] = React.useState<ClienteResumen[]>(clientesIniciales);
  React.useEffect(() => {
    setClientes(clientesIniciales);
  }, [clientesIniciales]);
  const [crearClienteOpen, setCrearClienteOpen] = React.useState(false);
  const [calculadoraOpen, setCalculadoraOpen] = React.useState(false);

  // Carrito
  const [query, setQuery] = React.useState("");
  const [carrito, setCarrito] = React.useState<Map<string, LineaCarrito>>(new Map());

  // Descuento
  const [descPct, setDescPct] = React.useState("");
  const [descMonto, setDescMonto] = React.useState("");

  // Ventas en espera / borrador: `activeCartId` identifica el cobro que se está
  // armando AHORA en este dispositivo — se persiste en localStorage para que,
  // si se cierra el navegador o se va la luz sin cobrar ni cancelar, al volver
  // se restaure el mismo borrador desde `mm_ventas_pendientes` (autoguardado
  // más abajo). "Dejar en espera" simplemente asigna un cartId nuevo y deja el
  // anterior guardado, visible en el panel "En espera".
  const [activeCartId, setActiveCartId] = React.useState<string | null>(null);
  const [notaActiva, setNotaActiva] = React.useState("");
  const [restaurado, setRestaurado] = React.useState(false);
  // Id del presupuesto que se está convirtiendo en esta venta, si se llegó
  // desde "Convertir en venta" — ver `presupuestoInicial` más arriba. `null`
  // en el 100% de las ventas normales (sin presupuesto involucrado). Nunca
  // cambia tras montar, así que es una constante derivada, no estado.
  const presupuestoIdEnCurso = presupuestoInicial?.id ?? null;
  const [dejarEnEsperaOpen, setDejarEnEsperaOpen] = React.useState(false);
  const [guardandoEnEspera, setGuardandoEnEspera] = React.useState(false);

  // Cobro
  const [cobrarOpen, setCobrarOpen] = React.useState(false);
  const [pagos, setPagos] = React.useState<PagoRow[]>([
    { key: newKey(), metodo: metodoPorDefecto, monto: "" },
  ]);
  // IVA/IGTF de ESTA venta puntual: arrancan igual a la configuración fiscal
  // del negocio (props `ivaActivo`/`igtfActivo`), pero el cajero puede
  // activar/desactivarlos solo para este cobro sin tocar Configuración ni la
  // ficha de ningún producto (regla del módulo Ventas — override puntual).
  // Todo el cálculo sigue pasando por `computeCobro`/`calcularMontoSaldo`
  // (misma fórmula de siempre, REGLA CRÍTICA #1); esto solo cambia CUÁLES
  // banderas se le pasan.
  const [igtfOn, setIgtfOn] = React.useState(igtfActivo);
  const [ivaOn, setIvaOn] = React.useState(ivaActivo);
  // Tasa de este cobro: arranca igual a la tasa preseleccionada, pero el cajero
  // puede elegir otra de las 3 puntualmente para esta venta (ej. cobrar a tasa
  // Euro/digital en vez de la BCV configurada). Se resetea a la preseleccionada
  // si el diálogo está cerrado y esta cambia (revalidación de la página).
  const [tasaCobroTipo, setTasaCobroTipo] = React.useState<TipoTasa>(fuentePreferida);
  const tasaCobro = tasas[tasaCobroTipo] ?? null;
  // Moneda en la que se entrega el vuelto REAL en efectivo (puede ser
  // distinta a la del pago: pagan en USD, vuelto en Bs es lo más común en una
  // bodega venezolana). Bs por defecto; el cajero puede cambiarlo.
  const [vueltoMoneda, setVueltoMoneda] = React.useState<"USD" | "VES">("VES");
  // Si el cajero elige devolver el vuelto por banco en vez de efectivo, guarda
  // aquí la cuenta elegida (null = efectivo, camino de siempre sin cambios).
  const [vueltoCuentaId, setVueltoCuentaId] = React.useState<string | null>(null);
  // true = el cajero eligió acreditar el excedente al cliente en vez de
  // devolverlo — mutuamente excluyente con vueltoCuentaId y con efectivo.
  const [vueltoAcreditar, setVueltoAcreditar] = React.useState(false);
  // Detalle del carrito plegado dentro del diálogo de cobro (visible bajo demanda,
  // para no alargar el diálogo cuando no hace falta ajustar cantidades ahí mismo).
  const [detalleCarritoAbierto, setDetalleCarritoAbierto] = React.useState(false);
  // Buscador de productos DENTRO del diálogo de cobro — el cliente pide algo
  // más a mitad del cobro y el cajero lo agrega sin cerrar el diálogo.
  const [busquedaCobro, setBusquedaCobro] = React.useState("");

  React.useEffect(() => {
    if (!cobrarOpen) {
      setTasaCobroTipo(fuentePreferida);
      setVueltoMoneda("VES");
      setVueltoCuentaId(null);
      setVueltoAcreditar(false);
      // Cada cobro nuevo arranca de nuevo con el default fiscal del negocio —
      // el override puntual del cobro anterior no debe arrastrarse al siguiente.
      setIgtfOn(igtfActivo);
      setIvaOn(ivaActivo);
    }
  }, [fuentePreferida, cobrarOpen, igtfActivo, ivaActivo]);

  // Cuentas bancarias activas, agrupadas por método — solo online (ver prop).
  const cuentasPorMetodo = React.useCallback(
    (metodo: MmMetodoPago) => cuentasBancarias.filter((c) => c.metodo === metodo && c.activa),
    [cuentasBancarias],
  );
  const cuentaPredeterminadaDe = React.useCallback(
    (metodo: MmMetodoPago): string | null => {
      if (!esMetodoConCuenta(metodo)) return null;
      const delMetodo = cuentasPorMetodo(metodo);
      return delMetodo.find((c) => c.predeterminada)?.id ?? delMetodo[0]?.id ?? null;
    },
    [cuentasPorMetodo],
  );
  // Cuentas válidas como destino de un vuelto digital (pago móvil/transferencia).
  const cuentasVueltoDigital = React.useMemo(
    () => cuentasBancarias.filter((c) => c.activa && esMetodoVueltoDigital(c.metodo)),
    [cuentasBancarias],
  );

  // Cliente (carrito)
  const [clienteId, setClienteId] = React.useState<string>("");
  const [clienteQuery, setClienteQuery] = React.useState("");
  const [clienteDropdown, setClienteDropdown] = React.useState(false);
  const clienteRef = React.useRef<HTMLDivElement>(null);

  // Cliente (diálogo de cobro)
  const [dialogClienteQuery, setDialogClienteQuery] = React.useState("");
  const [dialogClienteDropdown, setDialogClienteDropdown] = React.useState(false);
  const dialogClienteRef = React.useRef<HTMLDivElement>(null);

  // Envío de datos de pago por WhatsApp (pago móvil / transferencia / Zelle)
  const [panelWhatsappKey, setPanelWhatsappKey] = React.useState<string | null>(null);
  const [waOtroNumero, setWaOtroNumero] = React.useState(false);
  const [waNumeroPersonalizado, setWaNumeroPersonalizado] = React.useState("");

  const [error, setError] = React.useState<string | null>(null);
  const [pending, startVenta] = React.useTransition();
  const offline = !useOnline();

  // Granel: producto pendiente de ingresar peso
  const [granelProducto, setGranelProducto] = React.useState<ProductoConStock | null>(null);
  const [granelCantidad, setGranelCantidad] = React.useState("");
  // true = editar la cantidad de una línea ya en el carrito (reemplaza el total); false = sumar al carrito
  const [granelReemplaza, setGranelReemplaza] = React.useState(false);

  // Precio ajustado por línea (puntual para esta venta, no toca el catálogo).
  const [precioEditandoId, setPrecioEditandoId] = React.useState<string | null>(null);
  const [precioNuevoInput, setPrecioNuevoInput] = React.useState("");
  const [precioNuevoMoneda, setPrecioNuevoMoneda] = React.useState<"USD" | "VES">("USD");
  const [motivoAjusteInput, setMotivoAjusteInput] = React.useState("");
  // Cuando el modal de "ajustar precio" se abre ENCIMA del diálogo de cobro
  // (desde el botón dentro de "Ver productos") y se cierra, el clic que lo
  // cierra a veces también se registra como una interacción "fuera" del
  // diálogo de cobro (dos <Dialog> independientes apilados) y dispara su
  // cierre por error, mandando la venta a "en espera" sin que el cajero lo
  // pidiera. Esta bandera avisa al diálogo de cobro que ESE cierre en
  // particular es un efecto colateral del modal hijo, no una salida real.
  const ignorarProximoCierreCobroRef = React.useRef(false);

  // Escáner de cámara
  const [scannerOpen, setScannerOpen] = React.useState(false);
  const [scannerError, setScannerError] = React.useState<string | null>(null);
  const [scanNotFound, setScanNotFound] = React.useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  // Ref para poder usar agregarPorCodigo dentro del useEffect sin listarlo como dep
  const agregarPorCodigoRef = React.useRef<(codigo: string) => void>(() => undefined);

  // Lector fisico de codigo de barras (listener global, ver mas abajo)
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const scanBufferRef = React.useRef("");
  const scanInicioRef = React.useRef(0);

  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (clienteRef.current && !clienteRef.current.contains(e.target as Node)) {
        setClienteDropdown(false);
      }
      if (dialogClienteRef.current && !dialogClienteRef.current.contains(e.target as Node)) {
        setDialogClienteDropdown(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Abre/cierra la cámara cuando el modal del escáner se muestra/oculta
  React.useEffect(() => {
    if (!scannerOpen) return;

    let active = true;
    let rafId: number | null = null;

    const BD =
      typeof window !== "undefined"
        ? (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
        : undefined;

    if (!BD) {
      setScannerError(
        "Tu navegador no admite el escáner de cámara. Usa Chrome o Edge. Puedes escribir el código manualmente en el buscador y presionar Enter.",
      );
      return;
    }

    const detector = new BD({
      formats: ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "qr_code"],
    });

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }

        async function tick() {
          if (!active || !videoRef.current || videoRef.current.readyState < 2) {
            if (active) rafId = requestAnimationFrame(tick);
            return;
          }
          try {
            const results = await detector.detect(videoRef.current);
            const first = results[0];
            if (first && active) {
              active = false;
              agregarPorCodigoRef.current(first.rawValue);
              setScannerOpen(false);
              if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
                streamRef.current = null;
              }
              return;
            }
          } catch {
            // fallo de frame — seguir escaneando
          }
          if (active) rafId = requestAnimationFrame(tick);
        }

        rafId = requestAnimationFrame(tick);
      })
      .catch(() => {
        if (active) {
          setScannerError(
            "No se pudo acceder a la cámara. Verifica los permisos en tu navegador e intenta de nuevo.",
          );
        }
      });

    return () => {
      active = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [scannerOpen]);

  const money = React.useCallback(
    (valor: number, moneda: string) => {
      try {
        return new Intl.NumberFormat(locale, { style: "currency", currency: moneda }).format(valor);
      } catch {
        return `${moneda} ${valor.toFixed(2)}`;
      }
    },
    [locale],
  );

  // Productos frecuentes (accesos rápidos) — solo cuando no hay búsqueda activa
  const frecuentes = React.useMemo(
    () =>
      frecuentesIds.length > 0
        ? frecuentesIds
            .map((id) => productos.find((p) => p.id === id && p.activo))
            .filter((p): p is ProductoConStock => p !== undefined)
        : [],
    [frecuentesIds, productos],
  );

  // Filtro de productos
  const filtrados = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return productos;
    return productos.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) ||
        (p.codigo ?? "").toLowerCase().includes(q) ||
        (p.codigo_barras ?? "").toLowerCase().includes(q) ||
        p.codigos.some((c) => c.toLowerCase().includes(q)),
    );
  }, [productos, query]);

  // Resultados de la búsqueda DENTRO del diálogo de cobro (agregar sin cerrarlo).
  const resultadosCobro = React.useMemo(() => {
    const q = busquedaCobro.trim().toLowerCase();
    if (!q) return [];
    return productos
      .filter(
        (p) =>
          p.activo &&
          (p.nombre.toLowerCase().includes(q) ||
            (p.codigo ?? "").toLowerCase().includes(q) ||
            (p.codigo_barras ?? "").toLowerCase().includes(q) ||
            p.codigos.some((c) => c.toLowerCase().includes(q))),
      )
      .slice(0, 6);
  }, [productos, busquedaCobro]);

  // Cálculos del carrito
  const lineas = React.useMemo(() => Array.from(carrito.values()), [carrito]);
  const lineaEditandoPrecio = precioEditandoId ? (carrito.get(precioEditandoId) ?? null) : null;
  const subtotalBruto = lineas.reduce((s, l) => s + precioUnitarioLinea(l) * l.cantidad, 0);

  const descMontoNum = React.useMemo(() => {
    const m = parseFloat(descMonto.replace(",", "."));
    return Number.isFinite(m) && m >= 0 ? Math.min(m, subtotalBruto) : 0;
  }, [descMonto, subtotalBruto]);

  const descPctNum = React.useMemo(() => {
    const p = parseFloat(descPct.replace(",", "."));
    return Number.isFinite(p) && p >= 0 ? Math.min(p, 100) : 0;
  }, [descPct]);

  const descuentoUsd = descMontoNum;
  const subtotalNeto = Math.max(0, Math.round((subtotalBruto - descuentoUsd) * 100) / 100);
  const subtotalNetoBs = tasa ? Math.round(subtotalNeto * tasa * 100) / 100 : 0;
  // Base real del IVA: solo las líneas GRAVADAS (no exentas) del carrito, con
  // el estado EFECTIVO de cada línea (el override puntual del toggle de esta
  // venta, si lo hay — si no, el estado guardado del producto). Un producto
  // exento (o desactivado puntualmente) nunca debe sumar IVA, ni solo ni
  // mezclado con productos gravados en la misma venta.
  const subtotalGravado = subtotalNetoGravado(
    lineas.map((l) => ({
      totalUsd: precioUnitarioLinea(l) * l.cantidad,
      impuestoId: impuestoIdEfectivoLinea(l),
    })),
    descuentoUsd,
  );
  // Análogo para IGTF: solo las líneas que realmente lo causan (estado
  // efectivo, con override puntual si lo hay). Cuando TODAS las líneas
  // causan IGTF (el caso de hoy) el resultado es exactamente `subtotalNeto` —
  // cero cambio de comportamiento.
  const subtotalSujetoIgtf = subtotalNetoSujetoIgtf(
    lineas.map((l) => ({
      totalUsd: precioUnitarioLinea(l) * l.cantidad,
      aplicaIgtf: lineaAplicaIgtf(l),
    })),
    descuentoUsd,
  );
  const hayLineaExenta = lineas.some((l) => !lineaAplicaIva(l));

  // Cálculo de cobro — función pura única (probada en pos-calc.test.ts).
  // `puedeConfirmar` es la verdad única que habilita el botón Confirmar.
  // Cliente
  const clienteSeleccionado = clientes.find((c) => c.id === clienteId) ?? null;
  const disponibleFiado = clienteSeleccionado
    ? Math.max(0, clienteSeleccionado.limite_fiado_usd - clienteSeleccionado.saldo_usd)
    : 0;
  const saldoFavorCliente = clienteSeleccionado?.saldo_favor_usd ?? 0;

  const calcPagos = React.useMemo(
    () =>
      computeCobro({
        pagos: pagos.map((p) => ({ metodo: p.metodo, monto: p.monto })),
        subtotalNeto,
        tasa: tasaCobro,
        cantidadLineas: lineas.length,
        clienteId: clienteId || null,
        igtfActivo: igtfOn,
        ivaActivo: ivaOn,
        ivaPct,
        subtotalGravado,
        subtotalSujetoIgtf,
        saldoFavorDisponible: saldoFavorCliente,
      }),
    [
      pagos,
      subtotalNeto,
      tasaCobro,
      lineas.length,
      clienteId,
      igtfOn,
      ivaOn,
      ivaPct,
      subtotalGravado,
      subtotalSujetoIgtf,
      saldoFavorCliente,
    ],
  );

  // Excedente en Bs con precisión exacta (ver `calcularExcedenteBs`) — se usa
  // tanto para lo que se muestra en el diálogo como para lo que de verdad se
  // envía al servidor, así nunca se ven números distintos entre pantalla y lo
  // que termina registrado en Caja/Bancos.
  const excedenteBs = React.useMemo(
    () =>
      tasaCobro
        ? calcularExcedenteBs(
            pagos.map((p) => ({ metodo: p.metodo, monto: p.monto })),
            tasaCobro,
            calcPagos.totalBs,
            calcPagos.fiadoMonto,
            calcPagos.creditoMonto,
          )
        : 0,
    [pagos, tasaCobro, calcPagos.totalBs, calcPagos.fiadoMonto, calcPagos.creditoMonto],
  );

  const clientesFiltrados = React.useMemo(() => {
    const q = clienteQuery.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter(
      (c) => c.nombre.toLowerCase().includes(q) || (c.cedula ?? "").toLowerCase().includes(q),
    );
  }, [clientes, clienteQuery]);

  const dialogClientesFiltrados = React.useMemo(() => {
    const q = dialogClienteQuery.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter(
      (c) => c.nombre.toLowerCase().includes(q) || (c.cedula ?? "").toLowerCase().includes(q),
    );
  }, [clientes, dialogClienteQuery]);

  const tieneFiado = pagos.some((p) => p.metodo === "fiado");

  // Datos de pago (pago móvil / transferencia / Zelle) para el botón de WhatsApp.
  function normalizarTelefono(numero: string): string {
    return numero.replace(/\D/g, "").replace(/^0/, "58");
  }

  /**
   * Datos de pago para el mensaje de WhatsApp. Pago móvil/transferencia/Zelle
   * salen de la cuenta bancaria elegida en esta fila (o la predeterminada del
   * método si no eligió ninguna) — desde que existen cuentas configurables
   * (módulo Bancos), estos tres métodos ya NO guardan banco/teléfono/cuenta/
   * correo en `metodosPago` (jsonb de Configuración, ver migración 0089 para
   * Zelle y 0083 para los otros dos).
   */
  function lineasDatosPago(pago: PagoRow): string[] {
    if (pago.metodo === "pago_movil" || pago.metodo === "transferencia") {
      const cuentaId = pago.cuentaBancariaId ?? cuentaPredeterminadaDe(pago.metodo);
      const cuenta = cuentasBancarias.find((c) => c.id === cuentaId);
      if (!cuenta) return [];
      if (pago.metodo === "pago_movil") {
        return [
          `Banco: ${cuenta.banco}`,
          cuenta.telefono && `Teléfono: ${cuenta.telefono}`,
          `Titular: ${cuenta.titular}`,
          cuenta.rif && `Cédula/RIF: ${cuenta.rif}`,
        ].filter((l): l is string => Boolean(l));
      }
      return [
        `Banco: ${cuenta.banco}`,
        cuenta.cuenta && `Cuenta: ${cuenta.cuenta}`,
        `Titular: ${cuenta.titular}`,
        cuenta.rif && `Cédula/RIF: ${cuenta.rif}`,
      ].filter((l): l is string => Boolean(l));
    }
    if (pago.metodo === "zelle") {
      const cuentaId = pago.cuentaBancariaId ?? cuentaPredeterminadaDe(pago.metodo);
      const cuenta = cuentasBancarias.find((c) => c.id === cuentaId);
      if (!cuenta) return [];
      return [
        cuenta.correo && `Zelle: ${cuenta.correo}`,
        `Titular: ${cuenta.titular}`,
        cuenta.rif && `Cédula: ${cuenta.rif}`,
      ].filter((l): l is string => Boolean(l));
    }
    return [];
  }

  function numeroDestinoWhatsapp(): string {
    const numero = waOtroNumero
      ? waNumeroPersonalizado
      : (clienteSeleccionado?.whatsapp ?? clienteSeleccionado?.telefono ?? "");
    return normalizarTelefono(numero);
  }

  function enviarDatosPagoWhatsApp(pago: PagoRow) {
    const datos = lineasDatosPago(pago);
    if (datos.length === 0) {
      setError(
        "No hay datos de pago configurados para este método. Configúralos en Configuración > Métodos de pago.",
      );
      return;
    }

    const numero = numeroDestinoWhatsapp();
    if (!numero) {
      setError("Indica un número de WhatsApp válido para enviar los datos.");
      return;
    }

    const num = parseFloat(pago.monto.replace(",", "."));
    if (!Number.isFinite(num) || num <= 0) {
      setError("Ingresa el monto de este pago antes de enviar los datos.");
      return;
    }

    const monedaPago = monedaDe(pago.metodo);
    const montoTexto =
      monedaPago === "USD"
        ? tasaCobro
          ? `$${num.toFixed(2)} USD (Bs ${(num * tasaCobro).toFixed(2)} a la tasa de Bs ${tasaCobro.toFixed(2)}/USD)`
          : `$${num.toFixed(2)} USD`
        : tasaCobro
          ? `Bs ${num.toFixed(2)} (tasa: Bs ${tasaCobro.toFixed(2)}/USD)`
          : `Bs ${num.toFixed(2)}`;

    const itemsTexto = lineas.map((l) => `${l.cantidad} ${l.producto.nombre}`).join(", ");

    const mensaje = [
      `Hola${clienteSeleccionado ? ` ${clienteSeleccionado.nombre}` : ""}, aquí tienes los datos para tu pago por ${METODO_META[pago.metodo as MetodoId].label} en ${nombreComercial}:`,
      "",
      ...datos,
      "",
      `Compra: ${itemsTexto || "—"}`,
      `Monto a pagar: ${montoTexto}`,
    ].join("\n");

    window.open(
      `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`,
      "_blank",
      "noopener,noreferrer",
    );
    setPanelWhatsappKey(null);
  }

  // Acciones del carrito
  function agregar(p: ProductoConStock, cantidadExacta?: number) {
    if (p.tipo_venta === "granel" && cantidadExacta === undefined) {
      setGranelProducto(p);
      setGranelCantidad("");
      setGranelReemplaza(false);
      return;
    }
    const delta = cantidadExacta ?? 1;
    setCarrito((prev) => {
      const next = new Map(prev);
      const ya = next.get(p.id);
      next.set(p.id, {
        ...ya,
        producto: p,
        cantidad: Math.round(((ya?.cantidad ?? 0) + delta) * 1000) / 1000,
      });
      return next;
    });
  }

  /** Abre el modal de peso para AJUSTAR la cantidad de una línea a granel ya en el carrito. */
  function editarGranel(l: LineaCarrito) {
    setGranelProducto(l.producto);
    setGranelCantidad(String(l.cantidad));
    setGranelReemplaza(true);
  }

  function confirmarGranel() {
    if (!granelProducto) return;
    const cant = parseFloat(granelCantidad.replace(",", "."));
    if (!Number.isFinite(cant) || cant <= 0) return;
    if (granelReemplaza) {
      const cantidad = Math.round(cant * 1000) / 1000;
      setCarrito((prev) => {
        const next = new Map(prev);
        const ya = next.get(granelProducto.id);
        next.set(granelProducto.id, { ...ya, producto: granelProducto, cantidad });
        return next;
      });
    } else {
      agregar(granelProducto, cant);
    }
    setGranelProducto(null);
    setGranelCantidad("");
    setGranelReemplaza(false);
  }
  /** Abre el modal para ajustar el precio de una línea solo para esta venta
   * (nunca toca `producto.precio_usd` del catálogo). */
  function abrirEditarPrecio(l: LineaCarrito) {
    setPrecioEditandoId(l.producto.id);
    setPrecioNuevoMoneda("USD");
    setPrecioNuevoInput(precioUnitarioLinea(l).toFixed(2));
    setMotivoAjusteInput(l.motivoAjustePrecio ?? "");
  }

  function cerrarEditarPrecio() {
    // Si este modal se abrió con el diálogo de cobro abierto detrás, avisa
    // que el próximo intento de cierre del diálogo de cobro es un efecto
    // colateral de cerrar ESTE modal, no un cierre real del cajero.
    if (cobrarOpen) ignorarProximoCierreCobroRef.current = true;
    setPrecioEditandoId(null);
    setPrecioNuevoInput("");
    setMotivoAjusteInput("");
  }

  function aplicarPrecioAjustado() {
    if (!precioEditandoId) return;
    const num = parseFloat(precioNuevoInput.replace(",", "."));
    if (!Number.isFinite(num) || num <= 0) return;
    const tasaConversion = tasaCobro ?? tasa ?? 0;
    const precioUsd =
      precioNuevoMoneda === "USD" ? num : tasaConversion > 0 ? num / tasaConversion : num;
    const id = precioEditandoId;
    setCarrito((prev) => {
      const ya = prev.get(id);
      if (!ya) return prev;
      const next = new Map(prev);
      next.set(id, {
        ...ya,
        precioAjustadoUsd: Math.round(precioUsd * 100) / 100,
        motivoAjustePrecio: motivoAjusteInput.trim() || undefined,
      });
      return next;
    });
    cerrarEditarPrecio();
  }

  /** Quita el ajuste y vuelve al precio normal del catálogo para esta línea. */
  function quitarAjustePrecio(id: string) {
    setCarrito((prev) => {
      const ya = prev.get(id);
      if (!ya) return prev;
      const next = new Map(prev);
      next.set(id, {
        producto: ya.producto,
        cantidad: ya.cantidad,
        ivaOverride: ya.ivaOverride,
        igtfOverride: ya.igtfOverride,
      });
      return next;
    });
    cerrarEditarPrecio();
  }

  function cambiar(id: string, delta: number) {
    setCarrito((prev) => {
      const next = new Map(prev);
      const ya = next.get(id);
      if (!ya) return prev;
      const cantidad = ya.cantidad + delta;
      if (cantidad <= 0) next.delete(id);
      else next.set(id, { ...ya, cantidad });
      return next;
    });
  }
  /** Alterna el IVA de ESTA línea SOLO para esta venta (no toca el producto en
   * Inventario ni la config del negocio) — arranca del estado guardado del
   * producto y, al tocarlo, pasa al valor contrario explícito. */
  function alternarIvaLinea(id: string) {
    setCarrito((prev) => {
      const next = new Map(prev);
      const ya = next.get(id);
      if (!ya) return prev;
      next.set(id, { ...ya, ivaOverride: !lineaAplicaIva(ya) });
      return next;
    });
  }
  /** Análogo a `alternarIvaLinea` pero para IGTF. */
  function alternarIgtfLinea(id: string) {
    setCarrito((prev) => {
      const next = new Map(prev);
      const ya = next.get(id);
      if (!ya) return prev;
      next.set(id, { ...ya, igtfOverride: !lineaAplicaIgtf(ya) });
      return next;
    });
  }
  /** Formatea la cantidad de una línea del carrito: unidades enteras o peso/volumen con su unidad (ej. "0,250 kg"). */
  function formatCantidadLinea(l: LineaCarrito): string {
    if (l.producto.tipo_venta === "granel") {
      const num = l.cantidad.toLocaleString("es-VE", {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      });
      return `${num} ${l.producto.unidad}`;
    }
    return String(l.cantidad);
  }
  /** Formatea el stock disponible de un producto para mostrarlo en el catálogo
   * (mismo criterio que `formatCantidadLinea`: a granel con 3 decimales). */
  function formatStock(p: ProductoConStock): string {
    if (p.tipo_venta === "granel") {
      const num = p.stock_actual.toLocaleString("es-VE", {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      });
      return `${num} ${p.unidad}`;
    }
    return `${p.stock_actual} ${p.unidad}`;
  }
  function quitar(id: string) {
    setCarrito((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }

  const agregarPorCodigo = React.useCallback(
    (codigo: string) => {
      const codigoNorm = codigo.trim().toLowerCase();
      const producto = productos.find(
        (p) =>
          (p.codigo ?? "").toLowerCase() === codigoNorm ||
          (p.codigo_barras ?? "").toLowerCase() === codigoNorm ||
          p.codigos.some((c) => c.toLowerCase() === codigoNorm),
      );
      if (!producto) {
        setScanNotFound(codigo);
        setTimeout(() => setScanNotFound(null), 3000);
        return;
      }
      setScanNotFound(null);
      agregar(producto);
      reproducirBeepEscaneo();
    },
    [productos],
  );

  React.useEffect(() => {
    agregarPorCodigoRef.current = agregarPorCodigo;
  }, [agregarPorCodigo]);

  // Lector fisico de codigo de barras: escucha SIEMPRE que el cajero este en
  // la pantalla principal de venta (sin ningun dialogo que exija su atencion
  // encima), sin necesidad de tocar el icono de escanear ni el buscador. Un
  // lector USB "teclea" cada digito del codigo en pocos milisegundos y
  // termina con Enter — eso lo distingue de una persona escribiendo a mano.
  // La deteccion mide el RITMO PROMEDIO de toda la rafaga (ver
  // RITMO_PROMEDIO_MAX_MS), no el gap entre cada par de teclas: medir tecla a
  // tecla es fragil bajo carga del hilo principal (ej. las miniaturas del
  // carrito decodificando una imagen) porque un solo frame lento hace que ESE
  // gap puntual se mida artificialmente largo y tire todo el buffer, aunque
  // el lector haya entregado los caracteres perfectamente rapido — eso se
  // percibe como "el lector dejo de funcionar" sin que el lector fallara. Si
  // el foco esta en el buscador, lo deja pasar tal cual: ese input ya maneja
  // su propio Enter (ver mas abajo) y manejarlo tambien aqui duplicaria el
  // agregado.
  React.useEffect(() => {
    const pantallaLibre =
      !cobrarOpen && !calculadoraOpen && !crearClienteOpen && !dejarEnEsperaOpen && !granelProducto;
    if (!pantallaLibre) return;

    function onKeyDown(e: KeyboardEvent) {
      const ahora = performance.now();

      if (e.key === "Enter") {
        const codigo = scanBufferRef.current;
        const inicio = scanInicioRef.current;
        scanBufferRef.current = "";
        scanInicioRef.current = 0;
        if (codigo.length >= LARGO_MINIMO_CODIGO_ESCANEADO && inicio > 0) {
          const ritmoPromedio = (ahora - inicio) / codigo.length;
          if (ritmoPromedio <= RITMO_PROMEDIO_MAX_MS) {
            if (document.activeElement === searchInputRef.current) return;
            e.preventDefault();
            agregarPorCodigoRef.current(codigo);
            setScannerOpen(false);
          }
        }
        return;
      }

      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;

      const transcurridoDesdeInicio = ahora - scanInicioRef.current;
      if (scanBufferRef.current === "" || transcurridoDesdeInicio > RAFAGA_MAX_DURACION_MS) {
        scanInicioRef.current = ahora;
        scanBufferRef.current = e.key;
      } else {
        scanBufferRef.current += e.key;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cobrarOpen, calculadoraOpen, crearClienteOpen, dejarEnEsperaOpen, granelProducto]);

  /** Cliente creado en vivo (modal "Crear cliente nuevo"): lo agrega a la lista y lo selecciona. */
  function onClienteCreado(c: ClienteCreadoPos) {
    setClientes((prev) => [c, ...prev]);
    setClienteId(c.id);
    setClienteQuery("");
    setDialogClienteQuery("");
    setError(null);
  }

  function abrirCobro() {
    setError(null);
    setTasaCobroTipo(fuentePreferida);
    // El monto inicial debe calcularse EN LA MONEDA de `metodoPorDefecto` (Bs,
    // USD, o con gross-up de IGTF si ese método lo causa) — nunca asumir Bs a
    // fuego: si "Efectivo Bs" está desactivado, el método por defecto puede
    // ser otro (ej. Efectivo USD), y multiplicar por la tasa igual produciría
    // un monto en escala Bs metido en una fila que se interpreta como USD,
    // inflando el IGTF de forma absurda. `calcularMontoSaldo` ya sabe hacer
    // esta cuenta bien para cualquier método (es la misma del botón "← saldo").
    const filaInicial = {
      key: newKey(),
      metodo: metodoPorDefecto,
      monto: "",
      autoSaldo: true,
      cuentaBancariaId: cuentaPredeterminadaDe(metodoPorDefecto),
    };
    const montoInicial = tasa
      ? (calcularMontoSaldo(
          [filaInicial],
          filaInicial.key,
          subtotalNeto,
          tasa,
          igtfOn,
          ivaOn,
          ivaPct,
          saldoFavorCliente,
          subtotalGravado,
          subtotalSujetoIgtf,
        ) ?? "")
      : "";
    setPagos([{ ...filaInicial, monto: montoInicial }]);
    setCobrarOpen(true);
  }

  function agregarFilaPago() {
    if (pagos.length >= 4) return;
    // Mismo cuidado que en `abrirCobro`: el monto sugerido para la fila nueva
    // debe salir de `calcularMontoSaldo` (respeta la moneda real de
    // `metodoPorDefecto` y el IGTF si aplica), no de multiplicar el faltante
    // en USD por la tasa asumiendo que la fila siempre es en Bs.
    const filaNueva = {
      key: newKey(),
      metodo: metodoPorDefecto,
      monto: "",
      autoSaldo: true,
      cuentaBancariaId: cuentaPredeterminadaDe(metodoPorDefecto),
    };
    const pagosConNueva = [...pagos, filaNueva];
    const montoNueva = tasaCobro
      ? (calcularMontoSaldo(
          pagosConNueva,
          filaNueva.key,
          subtotalNeto,
          tasaCobro,
          igtfOn,
          ivaOn,
          ivaPct,
          saldoFavorCliente,
          subtotalGravado,
          subtotalSujetoIgtf,
        ) ?? "")
      : "";
    setPagos((prev) => [...prev, { ...filaNueva, monto: montoNueva }]);
  }

  /**
   * Al SALIR de fiado hacia un método real (cambio de método, o el cliente se
   * quita del carrito y fiado deja de ser válido), el saldo que fiado estaba
   * cubriendo debe TRASLADARSE al nuevo método, no desaparecer — el cajero no
   * debe tener que volver a calcularlo a mano.
   *  - Si el cajero había tecleado un monto de fiado a mano, se convierte (es
   *    USD) a la moneda del método nuevo.
   *  - Si lo dejó vacío (fiado auto-completa el restante en vivo), se calcula
   *    esa misma cifra ya en la moneda del método nuevo — la misma cuenta que
   *    hace el botón "← saldo" (`calcularMontoSaldo`), evaluada como si esta
   *    fila ya fuera del método nuevo.
   */
  function trasladarSaldoDesdeFiado(
    fila: PagoRow,
    metodoNuevo: MmMetodoPago,
    filasActuales: PagoRow[],
  ): PagoRow {
    const cuentaBancariaId = cuentaPredeterminadaDe(metodoNuevo);
    const escrito = parseFloat(fila.monto.replace(",", "."));
    if (Number.isFinite(escrito) && escrito > 0) {
      const monedaNueva = monedaDe(metodoNuevo);
      const nuevoMonto =
        monedaNueva === "USD" || !tasaCobro ? escrito.toFixed(2) : (escrito * tasaCobro).toFixed(2);
      return {
        ...fila,
        metodo: metodoNuevo,
        monto: nuevoMonto,
        autoSaldo: false,
        cuentaBancariaId,
      };
    }
    const filasHipoteticas = filasActuales.map((f) =>
      f.key === fila.key ? { ...f, metodo: metodoNuevo } : f,
    );
    const sugerido = tasaCobro
      ? calcularMontoSaldo(
          filasHipoteticas,
          fila.key,
          subtotalNeto,
          tasaCobro,
          igtfOn,
          ivaOn,
          ivaPct,
          saldoFavorCliente,
          subtotalGravado,
          subtotalSujetoIgtf,
        )
      : null;
    return {
      ...fila,
      metodo: metodoNuevo,
      monto: sugerido ?? "",
      autoSaldo: true,
      cuentaBancariaId,
    };
  }

  function cambiarMetodoPago(key: string, metodo: MmMetodoPago) {
    setPagos((prev) =>
      prev.map((p) => {
        if (p.key !== key) return p;
        // Entrar a fiado: se deja vacío para que compute el restante en vivo
        // (mismo patrón que "Dejar el resto a fiado").
        if (metodo === "fiado") {
          return { ...p, metodo, monto: "", cuentaBancariaId: null };
        }
        // Salir de fiado hacia un método real: traslada el saldo, no lo borra.
        if (p.metodo === "fiado") {
          return trasladarSaldoDesdeFiado(p, metodo, prev);
        }
        const monedaAnterior = monedaDe(p.metodo);
        const monedaNueva = monedaDe(metodo);
        // Si cambia la denominación (Bs↔USD), CONVIERTE el monto con la tasa de
        // esta venta en vez de borrarlo — el cajero no debe reescribir el número.
        let nuevoMonto = p.monto;
        if (monedaAnterior !== monedaNueva && p.monto && tasaCobro) {
          const num = parseFloat(p.monto.replace(",", "."));
          if (Number.isFinite(num) && num > 0) {
            const convertido = monedaNueva === "USD" ? num / tasaCobro : num * tasaCobro;
            nuevoMonto = convertido.toFixed(2);
          }
        }
        return {
          ...p,
          metodo,
          monto: nuevoMonto,
          cuentaBancariaId: cuentaPredeterminadaDe(metodo),
        };
      }),
    );
    if (metodo === "fiado" && !clienteSeleccionado) {
      setError("Para fiar debes seleccionar un cliente.");
    } else {
      setError(null);
    }
  }

  function cambiarMontoPago(key: string, monto: string) {
    // Monto tecleado a mano por el cajero: deja de ser "el saldo" y pasa a ser
    // un monto físico fijo que no debe recalcularse si luego cambia la tasa.
    setPagos((prev) => prev.map((p) => (p.key === key ? { ...p, monto, autoSaldo: false } : p)));
  }

  /** El cajero cambia a mano a cuál cuenta entra este pago (por defecto ya
   * viene la predeterminada del método — esto solo aplica cuando hay más de una). */
  function cambiarCuentaPago(key: string, cuentaBancariaId: string) {
    setPagos((prev) => prev.map((p) => (p.key === key ? { ...p, cuentaBancariaId } : p)));
  }

  // Agrega una fila Fiado con monto vacío: computeCobro auto-absorbe el restante
  // exacto, así el faltante pasa a 0 y el botón Confirmar se habilita.
  function dejarRestoFiado() {
    if (pagos.length >= 4) return;
    setError(null);
    setPagos((prev) => [...prev, { key: newKey(), metodo: "fiado", monto: "" }]);
  }

  // Agrega una fila "Saldo a favor" pre-llenada con el mínimo entre lo que
  // falta por cubrir y lo que el cliente tiene disponible — a diferencia de
  // fiado, el monto SIEMPRE es explícito (nunca auto-completa el restante en
  // vivo, así que no hace falta que el cajero lo revise antes de confirmar).
  function usarSaldoFavor() {
    if (pagos.length >= 4) return;
    if (!clienteSeleccionado || saldoFavorCliente <= 0.001) return;
    setError(null);
    const filaNueva = {
      key: newKey(),
      metodo: "credito_cliente" as const,
      monto: "",
      autoSaldo: false,
      cuentaBancariaId: null,
    };
    const pagosConNueva = [...pagos, filaNueva];
    const montoNueva = tasaCobro
      ? (calcularMontoSaldo(
          pagosConNueva,
          filaNueva.key,
          subtotalNeto,
          tasaCobro,
          igtfOn,
          ivaOn,
          ivaPct,
          saldoFavorCliente,
          subtotalGravado,
          subtotalSujetoIgtf,
        ) ?? "")
      : "";
    setPagos((prev) => [...prev, { ...filaNueva, monto: montoNueva }]);
  }

  function quitarFilaPago(key: string) {
    setPagos((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((p) => p.key !== key);
    });
  }

  // Rellena el monto exacto para cubrir el saldo en la moneda del método de esa fila.
  // Para métodos con IGTF (Zelle/USD cash): divide por (1 - IGTF_RATE) para que el total cubra.
  // Marca la fila como autoSaldo para que, si luego cambia la tasa, se recalcule sola.
  const sugerirSaldo = React.useCallback(
    (key: string) => {
      if (!tasaCobro) return;
      const sugerido = calcularMontoSaldo(
        pagos,
        key,
        subtotalNeto,
        tasaCobro,
        igtfOn,
        ivaOn,
        ivaPct,
        saldoFavorCliente,
        subtotalGravado,
        subtotalSujetoIgtf,
      );
      if (sugerido === null) return;
      setPagos((prev) =>
        prev.map((p) => (p.key === key ? { ...p, monto: sugerido, autoSaldo: true } : p)),
      );
    },
    [
      pagos,
      subtotalNeto,
      tasaCobro,
      igtfOn,
      ivaOn,
      ivaPct,
      saldoFavorCliente,
      subtotalGravado,
      subtotalSujetoIgtf,
    ],
  );

  // Las filas en Bs que representan "el saldo" (← saldo, o el pre-llenado
  // inicial del diálogo) deben seguir cubriendo el total SIEMPRE que ese
  // total se mueva — no solo cuando cambia la tasa de cobro (selector
  // BCV/Euro/Digital), sino también cuando cambia el carrito (agregar/quitar
  // un producto, +/-, editar una fracción a granel) o el IVA, porque todo
  // eso mueve `subtotalNeto`. Antes este efecto solo recalculaba si la tasa
  // en sí había cambiado (comparándola contra la anterior) — `subtotalNeto`
  // ya estaba en las dependencias, así que el efecto SÍ se disparaba al
  // tocar el carrito, pero esa comparación lo cortaba antes de recalcular
  // nada, dejando el monto pre-llenado congelado en el total viejo mientras
  // el total mostrado (`calcPagos.totalUsd`, que sí lee `subtotalNeto` en
  // vivo) seguía de largo — el "falta por cubrir" quedaba descuadrado. Las
  // filas con un monto tecleado a mano (autoSaldo=false) nunca se tocan aquí
  // — ver `pos-calc.ts::recalcularPagosPorTasa`. Ver CLAUDE.md regla 12-14.
  React.useEffect(() => {
    if (!tasaCobro) return;
    setPagos((prev) =>
      recalcularPagosPorTasa(
        prev,
        subtotalNeto,
        tasaCobro,
        igtfOn,
        ivaOn,
        ivaPct,
        subtotalGravado,
        subtotalSujetoIgtf,
      ),
    );
  }, [tasaCobro, subtotalNeto, igtfOn, ivaOn, ivaPct, subtotalGravado, subtotalSujetoIgtf]);

  // ── Ventas en espera / borrador ──────────────────────────────────────────
  // Carga en el estado del POS el carrito/pagos/cliente/tasa/nota de una fila
  // de `mm_ventas_pendientes` (al restaurar un borrador al montar, o al
  // retomar una venta en espera desde el panel). Devuelve cuántos productos
  // del carrito guardado ya no existen (se omiten en vez de tumbar la carga).
  const hidratarDesdeVentaPendiente = React.useCallback(
    (
      row: Pick<
        VentaPendienteRow,
        "cliente_id" | "nota" | "descuento_pct" | "descuento_monto" | "tasa_tipo"
      >,
      carritoItems: {
        productoId: string;
        cantidad: number;
        precioAjustadoUsd?: number;
        motivoAjustePrecio?: string;
        ivaOverride?: boolean;
        igtfOverride?: boolean;
      }[],
      pagosItems: {
        metodo: MmMetodoPago;
        monto: string;
        autoSaldo?: boolean;
        cuentaBancariaId?: string;
      }[],
    ) => {
      const nuevoCarrito = new Map<string, LineaCarrito>();
      let omitidos = 0;
      for (const item of carritoItems) {
        const producto = productos.find((p) => p.id === item.productoId);
        if (producto)
          nuevoCarrito.set(producto.id, {
            producto,
            cantidad: item.cantidad,
            precioAjustadoUsd: item.precioAjustadoUsd,
            motivoAjustePrecio: item.motivoAjustePrecio,
            ivaOverride: item.ivaOverride,
            igtfOverride: item.igtfOverride,
          });
        else omitidos += 1;
      }
      setCarrito(nuevoCarrito);
      setPagos(
        pagosItems.length > 0
          ? pagosItems.map((p) => {
              // El borrador puede venir de ANTES de que el negocio desactivara
              // este método en Configuración — si ya no está activo, no lo
              // restauramos tal cual (quedaría cobrando por un método oculto
              // del selector): se cambia al método por defecto y se limpia el
              // monto para que el cajero lo confirme a mano.
              const activo = metodosActivosSet.has(p.metodo);
              return {
                key: newKey(),
                metodo: activo ? p.metodo : metodoPorDefecto,
                monto: activo ? p.monto : "",
                autoSaldo: activo ? p.autoSaldo : undefined,
                // Si el método sigue activo, restaura la cuenta bancaria
                // elegida; si no, se recalcula sola con la predeterminada al
                // cambiar de método (ver `cambiarMetodoPago`/`cuentaPredeterminadaDe`).
                cuentaBancariaId: activo
                  ? (p.cuentaBancariaId ?? cuentaPredeterminadaDe(p.metodo))
                  : undefined,
              };
            })
          : [{ key: newKey(), metodo: metodoPorDefecto, monto: "" }],
      );
      setClienteId(row.cliente_id ?? "");
      setDescMonto(row.descuento_monto ?? "");
      setDescPct(row.descuento_pct ?? "");
      if (esTipoTasa(row.tasa_tipo)) setTasaCobroTipo(row.tasa_tipo);
      setNotaActiva(row.nota ?? "");
      return omitidos;
    },
    [productos, metodosActivosSet, metodoPorDefecto, cuentaPredeterminadaDe],
  );

  /**
   * Guarda el carrito ACTUAL (el que representa `activeCartId`) en
   * `mm_ventas_pendientes` con el `estado` indicado — es la única función que
   * escribe en esa tabla desde este componente:
   *  - 'activo'    -> autoguardado continuo y salvavidas al desmontar: es EL
   *                   borrador que este dispositivo tiene abierto ahora
   *                   mismo. Nunca debe aparecer en el panel "En espera".
   *  - 'en_espera' -> el cajero lo dejó a un lado A PROPÓSITO (cerró el cobro
   *                   sin pagar, o tocó "Dejar en espera"). SÍ debe aparecer
   *                   en "En espera" — el panel filtra solo por este campo,
   *                   nunca comparando ids en memoria.
   *
   * Devuelve `false` si `powerSyncDb`/`sucursalId`/`activeCartId` todavía no
   * están listos o el carrito está vacío — NO es necesariamente un error: al
   * montar el POS, PowerSync tarda un instante en inicializar (WASM +
   * IndexedDB), y si el cajero cierra el diálogo de cobro en esa ventana
   * exacta, esta función (cerrada sobre el valor de ESE render) puede ver
   * `powerSyncDb` en null aunque un instante después ya esté listo. Por eso
   * los llamadores envuelven esta función en `reintentar()` en vez de darse
   * por vencidos al primer `false`, y además respaldan el intento en
   * localStorage (`guardarEnEsperaConRespaldo`, más abajo) para no depender
   * NUNCA de que ese reintento alcance a tener éxito en esta misma sesión.
   */
  const guardarBorradorActivo = React.useCallback(
    async (nota: string | null, estado: EstadoVentaPendiente = "activo"): Promise<boolean> => {
      if (!powerSyncDb || !sucursalId || !activeCartId || lineas.length === 0) return false;
      try {
        await guardarVentaPendienteLocal(powerSyncDb, {
          id: activeCartId,
          tenantId,
          sucursalId,
          usuarioId,
          clienteId: clienteId || null,
          nota: (nota ?? notaActiva).trim() || null,
          carrito: lineas.map((l) => ({
            productoId: l.producto.id,
            cantidad: l.cantidad,
            precioAjustadoUsd: l.precioAjustadoUsd,
            motivoAjustePrecio: l.motivoAjustePrecio,
            ivaOverride: l.ivaOverride,
            igtfOverride: l.igtfOverride,
          })),
          pagos: pagos.map((p) => ({
            metodo: p.metodo,
            monto: p.monto,
            autoSaldo: p.autoSaldo,
            cuentaBancariaId: p.cuentaBancariaId ?? undefined,
          })),
          descuentoPct: descPct,
          descuentoMonto: descMonto,
          tasaTipo: tasaCobroTipo,
          subtotalUsd: subtotalNeto,
          estado,
        });
        return true;
      } catch (err) {
        console.error("No se pudo guardar la venta en espera:", err);
        return false;
      }
    },
    [
      powerSyncDb,
      sucursalId,
      activeCartId,
      lineas,
      pagos,
      clienteId,
      notaActiva,
      descPct,
      descMonto,
      tasaCobroTipo,
      subtotalNeto,
      tenantId,
      usuarioId,
    ],
  );

  // Al montar: restaura el borrador activo de este dispositivo (si lo hay) o
  // arranca uno nuevo. Corre UNA sola vez por apertura del POS — no debe
  // reaccionar a cambios posteriores del carrito (eso lo hace el autoguardado
  // de abajo), solo a que la base local esté lista.
  React.useEffect(() => {
    // Si se entra desde "Convertir en venta" de un presupuesto (ver más
    // abajo), NO se restaura el borrador local de este dispositivo — evita
    // una carrera entre ambos efectos que podría sobreescribir el carrito ya
    // precargado del presupuesto con una venta en curso no relacionada.
    if (presupuestoInicial) return;
    if (!powerSyncDb) return;
    let cancelado = false;
    void (async () => {
      const clave = claveCartIdStorage(tenantId);
      let id = localStorage.getItem(clave);
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(clave, id);
      }
      try {
        const fila = await obtenerVentaPendienteLocal(powerSyncDb, id);
        if (cancelado) return;
        if (fila) {
          const omitidos = hidratarDesdeVentaPendiente(
            fila,
            parseCarritoPendiente(fila),
            parsePagosPendiente(fila),
          );
          if (omitidos > 0) {
            toast.error(
              `${omitidos} producto(s) de una venta en curso ya no existen y se omitieron.`,
            );
          }
          // Vuelve a ser "el borrador activo de este dispositivo" — si por un
          // corte justo antes de rotar el cartId la fila hubiera quedado
          // marcada 'en_espera', se corrige aquí (no debe verse en el panel).
          if (fila.estado !== "activo") {
            void guardarVentaPendienteLocal(powerSyncDb, {
              id: fila.id,
              tenantId: fila.tenant_id,
              sucursalId: fila.sucursal_id,
              usuarioId: fila.usuario_id ?? usuarioId,
              clienteId: fila.cliente_id,
              nota: fila.nota,
              carrito: parseCarritoPendiente(fila),
              pagos: parsePagosPendiente(fila),
              descuentoPct: fila.descuento_pct,
              descuentoMonto: fila.descuento_monto,
              tasaTipo: fila.tasa_tipo,
              subtotalUsd: fila.subtotal_usd,
              estado: "activo",
            }).catch(() => undefined);
          }
        }
      } catch (err) {
        console.error("No se pudo restaurar el borrador de venta en espera:", err);
        // Si falla la lectura del borrador, se sigue con un carrito nuevo — no bloquea el POS.
      } finally {
        if (!cancelado) {
          setActiveCartId(id);
          setRestaurado(true);
        }
      }
    })();
    return () => {
      cancelado = true;
    };
    // Solo debe correr cuando la base local queda lista, no en cada cambio de estado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [powerSyncDb]);

  // Precarga el carrito con los productos/precios de un presupuesto al
  // convertirlo en venta — llega vía `?presupuestoId=` en ventas/nueva/page.tsx.
  // Corre UNA sola vez al montar, reutilizando tal cual `hidratarDesdeVentaPendiente`
  // (la misma función que ya usa "Ventas en espera"), sin tocar el diálogo de
  // cobro, `confirmarVenta`, `computeCobro`, IGTF, caja/bancos ni fiado.
  React.useEffect(() => {
    if (!presupuestoInicial) return;
    const omitidos = hidratarDesdeVentaPendiente(
      {
        cliente_id: presupuestoInicial.clienteId,
        nota: presupuestoInicial.notas,
        descuento_pct: "",
        descuento_monto: "",
        tasa_tipo: presupuestoInicial.tasaTipo,
      },
      presupuestoInicial.items,
      [],
    );
    if (omitidos > 0) {
      toast.error(
        `${omitidos} producto(s) del presupuesto ya no existen o no tienen stock y se omitieron.`,
      );
    }
    const id = crypto.randomUUID();
    localStorage.setItem(claveCartIdStorage(tenantId), id);
    setActiveCartId(id);
    setRestaurado(true);
    // Solo debe correr una vez, al montar con el presupuesto ya cargado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presupuestoInicial]);

  // Recupera cualquier venta en espera que haya quedado SOLO en el respaldo
  // local (localStorage, ver pos-outbox.ts) — por ejemplo si el navegador se
  // cerró a medio guardar antes de que `reintentar()` alcanzara a confirmar
  // la escritura en PowerSync. Corre una vez que se sabe con certeza cuál es
  // el cartId activo de este dispositivo (para no tocar esa fila aquí; la
  // restaura el efecto de arriba).
  React.useEffect(() => {
    if (!powerSyncDb || !sucursalId || !restaurado) return;
    let cancelado = false;
    void (async () => {
      const pendientes = leerOutbox(tenantId).filter(
        (e) => e.sucursalId === sucursalId && e.id !== activeCartId,
      );
      if (pendientes.length === 0) return;
      let recuperadas = 0;
      for (const entrada of pendientes) {
        if (cancelado) return;
        try {
          await guardarVentaPendienteLocal(powerSyncDb, {
            id: entrada.id,
            tenantId: entrada.tenantId,
            sucursalId: entrada.sucursalId,
            usuarioId: entrada.usuarioId,
            clienteId: entrada.clienteId,
            nota: entrada.nota,
            carrito: entrada.carrito,
            pagos: entrada.pagos,
            descuentoPct: entrada.descuentoPct,
            descuentoMonto: entrada.descuentoMonto,
            tasaTipo: entrada.tasaTipo,
            subtotalUsd: entrada.subtotalUsd,
            estado: entrada.estado,
          });
          quitarDeOutbox(tenantId, entrada.id);
          recuperadas += 1;
        } catch (err) {
          console.error("No se pudo recuperar una venta en espera del respaldo local:", err);
        }
      }
      if (recuperadas > 0 && !cancelado) {
        toast.success(
          recuperadas === 1
            ? "Se recuperó una venta en espera que había quedado pendiente de guardar."
            : `Se recuperaron ${recuperadas} ventas en espera pendientes de guardar.`,
        );
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [powerSyncDb, sucursalId, restaurado, activeCartId, tenantId]);

  // Autoguardado: mientras el carrito tenga artículos, cada cambio se refleja
  // (con un pequeño debounce) en `mm_ventas_pendientes` bajo el cartId activo,
  // con estado 'activo'. Así, si se va la luz o se recarga sin cobrar ni
  // cancelar, el borrador ya está guardado y se restaura solo (ver el efecto
  // de arriba). Si el carrito queda vacío, se borra la fila (no hay nada que
  // preservar).
  const autoguardadoTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    if (!powerSyncDb || !sucursalId || !activeCartId || !restaurado) return;

    if (lineas.length === 0) {
      void eliminarVentaPendienteLocal(powerSyncDb, activeCartId);
      return;
    }

    if (autoguardadoTimerRef.current) clearTimeout(autoguardadoTimerRef.current);
    autoguardadoTimerRef.current = setTimeout(() => {
      void guardarBorradorActivo(null, "activo");
    }, 600);

    return () => {
      if (autoguardadoTimerRef.current) clearTimeout(autoguardadoTimerRef.current);
    };
  }, [powerSyncDb, sucursalId, activeCartId, restaurado, lineas, guardarBorradorActivo]);

  // Salvavidas para cuando se abandona la pantalla de venta (navegación interna
  // a otra ruta) con el carrito armado sin cobrar: el autoguardado de arriba ya
  // cubre casi todos los casos, pero corre con un pequeño debounce — si el
  // cajero navega a otra pantalla a los pocos milisegundos del último cambio,
  // esto fuerza el guardado inmediato al desmontar. Usa un ref porque el efecto
  // de desmontaje solo debe correr UNA vez (al desmontar de verdad), no en cada
  // cambio de estado — el ref mantiene siempre el guardado más reciente a mano.
  const guardarBorradorActivoRef = React.useRef(guardarBorradorActivo);
  React.useEffect(() => {
    guardarBorradorActivoRef.current = guardarBorradorActivo;
  }, [guardarBorradorActivo]);
  React.useEffect(() => {
    return () => {
      void reintentar(() => guardarBorradorActivoRef.current(null, "activo"), {
        intentos: 5,
        esperaMs: 300,
      });
    };
  }, []);

  /** Vacía el carrito y arranca un cartId nuevo (no toca ninguna fila en `mm_ventas_pendientes`). */
  function iniciarCarritoNuevo() {
    setCarrito(new Map());
    setPagos([{ key: newKey(), metodo: metodoPorDefecto, monto: "" }]);
    setDescMonto("");
    setDescPct("");
    setClienteId("");
    setClienteQuery("");
    setNotaActiva("");
    const nuevo = crypto.randomUUID();
    localStorage.setItem(claveCartIdStorage(tenantId), nuevo);
    setActiveCartId(nuevo);
  }

  function resetCarritoTrasVenta() {
    // La venta se confirmó: el borrador que la representaba (si lo hay) ya no
    // hace falta — se vuelve una fila real en mm_ventas, no una pendiente.
    if (powerSyncDb && activeCartId) {
      void eliminarVentaPendienteLocal(powerSyncDb, activeCartId).catch(() => {
        // no crítico: si falla, el autoguardado del cartId anterior ya no corre
        // (se generó uno nuevo) y la fila quedaría huérfana pero inofensiva.
      });
    }
    if (activeCartId) quitarDeOutbox(tenantId, activeCartId);
    iniciarCarritoNuevo();
    setCobrarOpen(false);
  }

  /**
   * Deja la venta ACTUAL marcada como 'en_espera' con una garantía fuerte de
   * que no se pierde por timing: ANTES de intentar escribir en PowerSync
   * (que puede tardar en estar listo justo al montar el POS), guarda una
   * copia síncrona en localStorage (`pos-outbox.ts`) — siempre disponible,
   * sin depender de que PowerSync haya inicializado. Si el guardado real
   * falla o tarda, esa copia sigue ahí y se reintenta sola (aquí, y también
   * al volver a abrir el POS la próxima vez — ver el efecto de recuperación
   * de arriba) hasta que `mm_ventas_pendientes` la reciba.
   */
  async function guardarEnEsperaConRespaldo(nota: string | null): Promise<boolean> {
    if (!activeCartId || !sucursalId || lineas.length === 0) return false;

    const entrada: OutboxEntrada = {
      id: activeCartId,
      tenantId,
      sucursalId,
      usuarioId,
      clienteId: clienteId || null,
      nota: (nota ?? notaActiva).trim() || null,
      carrito: lineas.map((l) => ({
        productoId: l.producto.id,
        cantidad: l.cantidad,
        precioAjustadoUsd: l.precioAjustadoUsd,
        motivoAjustePrecio: l.motivoAjustePrecio,
        ivaOverride: l.ivaOverride,
        igtfOverride: l.igtfOverride,
      })),
      pagos: pagos.map((p) => ({
        metodo: p.metodo,
        monto: p.monto,
        autoSaldo: p.autoSaldo,
        cuentaBancariaId: p.cuentaBancariaId ?? undefined,
      })),
      descuentoPct: descPct,
      descuentoMonto: descMonto,
      tasaTipo: tasaCobroTipo,
      subtotalUsd: subtotalNeto,
      estado: "en_espera",
      guardadoEn: new Date().toISOString(),
    };
    guardarEnOutbox(tenantId, entrada);

    const ok = await reintentar(() => guardarBorradorActivoRef.current(nota, "en_espera"));
    if (ok) quitarDeOutbox(tenantId, entrada.id);
    return ok;
  }

  async function confirmarDejarEnEspera(nota: string) {
    if (lineas.length === 0) return;

    setGuardandoEnEspera(true);
    const ok = await guardarEnEsperaConRespaldo(nota);
    setGuardandoEnEspera(false);

    // El respaldo local ya garantiza que la venta no se pierde — el carrito
    // se libera siempre, haya confirmado PowerSync a tiempo o no.
    toast.success('Venta dejada en espera. Retómala desde "En espera" cuando quieras.');
    if (!ok) {
      toast.error(
        'Se guardó en este dispositivo; se agregará a "En espera" en cuanto la base local esté lista.',
      );
    }
    setDejarEnEsperaOpen(false);
    setCobrarOpen(false);
    iniciarCarritoNuevo();
  }

  /**
   * Dispara al cerrar el diálogo de cobro SIN haber cobrado (botón "X",
   * overlay, Escape, o el botón "Cerrar" del footer) — regla del POS: una
   * venta con carrito armado nunca se pierde en silencio, pasa a "en espera"
   * automáticamente y el carrito queda libre para atender otra venta ya
   * mismo. Si el carrito está vacío no hay nada que preservar, solo cierra.
   */
  async function cerrarCobroSinConfirmar() {
    setCobrarOpen(false);
    if (lineas.length === 0) return;
    const ok = await guardarEnEsperaConRespaldo(null);
    toast.success(
      'Venta dejada en espera automáticamente. Retómala desde "En espera" cuando quieras.',
    );
    if (!ok) {
      toast.error(
        'Se guardó en este dispositivo; se agregará a "En espera" en cuanto la base local esté lista.',
      );
    }
    iniciarCarritoNuevo();
  }

  async function retomarVentaPendiente({
    row,
    carrito: carritoItems,
    pagos: pagosItems,
  }: VentaPendienteParaRetomar) {
    // 1. La venta que se está por abandonar (si tiene algo) se deja marcada
    //    'en_espera' — el cajero la está dejando a un lado a propósito para
    //    atender esta otra.
    if (activeCartId && activeCartId !== row.id && lineas.length > 0) {
      await reintentar(() => guardarBorradorActivoRef.current(null, "en_espera"));
    }

    // 2. Carga la venta elegida en el POS y abre DIRECTO el diálogo de cobro
    //    (ya con el detalle completo: carrito, cliente, pagos y tasa que
    //    traía) — retomar significa "listo para cobrar", no volver al
    //    carrito a tener que tocar "Cobrar" de nuevo. Si el cajero cierra el
    //    diálogo con la X sin confirmar, `cerrarCobroSinConfirmar` (ya
    //    existente) la vuelve a dejar en espera igual que cualquier otro
    //    cobro sin terminar — no se pierde.
    const omitidos = hidratarDesdeVentaPendiente(row, carritoItems, pagosItems);
    setActiveCartId(row.id);
    localStorage.setItem(claveCartIdStorage(tenantId), row.id);
    setError(null);
    setCobrarOpen(true);

    // 3. La marca como 'activo' de inmediato — si no, seguiría visible en "En
    //    espera" hasta el próximo ciclo de autoguardado (~600ms). Sin
    //    reintentos: "Retomar" solo es accionable desde el panel, que solo es
    //    interactivo cuando powerSyncDb ya está listo.
    if (powerSyncDb) {
      try {
        await guardarVentaPendienteLocal(powerSyncDb, {
          id: row.id,
          tenantId: row.tenant_id,
          sucursalId: row.sucursal_id,
          usuarioId: row.usuario_id ?? usuarioId,
          clienteId: row.cliente_id,
          nota: row.nota,
          carrito: carritoItems,
          pagos: pagosItems,
          descuentoPct: row.descuento_pct,
          descuentoMonto: row.descuento_monto,
          tasaTipo: row.tasa_tipo,
          subtotalUsd: row.subtotal_usd,
          estado: "activo",
        });
      } catch (err) {
        console.error("No se pudo marcar la venta retomada como activa:", err);
      }
    }

    if (omitidos > 0) {
      toast.error(`${omitidos} producto(s) de esta venta ya no existen y se omitieron.`);
    } else {
      toast.success("Venta retomada.");
    }
  }

  function confirmarVenta() {
    if (tieneFiado && !clienteId) {
      setError("Para fiar debes seleccionar un cliente.");
      return;
    }
    if (calcPagos.faltante > 0.02) {
      setError(`Los pagos ingresados no cubren el total ($${calcPagos.totalUsd.toFixed(2)}).`);
      return;
    }
    if (lineas.length === 0) return;
    // Convertir un presupuesto exige revalidar permisos/estado en el servidor
    // (ver `marcarPresupuestoConvertido`) — sin conexión no hay forma de
    // hacerlo, así que se bloquea en vez de dejarlo pendiente de sincronizar
    // como una venta normal offline.
    if (presupuestoIdEnCurso && offline) {
      setError("Necesitas conexión para convertir un presupuesto en venta.");
      return;
    }

    setError(null);
    startVenta(async () => {
      const pagosEnvio = pagos
        .filter((p) => {
          if (p.metodo === "fiado") return true;
          const num = parseFloat(p.monto.replace(",", "."));
          return Number.isFinite(num) && num > 0;
        })
        .map((p) => {
          if (p.metodo === "fiado") {
            const montoFiadoReal = Math.max(
              0,
              Math.min(calcPagos.fiadoMonto, calcPagos.totalUsd - calcPagos.cubiertoSinFiado),
            );
            // Si el fiado resultante es $0 (p.ej. efectivo ya cubre todo), no enviar
            if (montoFiadoReal < 0.001) return null;
            return {
              metodo: p.metodo,
              monto: Math.round(montoFiadoReal * 100) / 100,
              moneda: "USD" as const,
            };
          }
          const num = parseFloat(p.monto.replace(",", "."));
          const monedaPago = monedaDe(p.metodo);
          return {
            metodo: p.metodo,
            monto: num,
            moneda: monedaPago === "VES" ? ("VES" as const) : ("USD" as const),
            cuenta_bancaria_id:
              esMetodoConCuenta(p.metodo) && !offline ? (p.cuentaBancariaId ?? null) : null,
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);

      // Excedente total (cualquier método, no solo efectivo) — el mismo campo
      // que ya usa la sección "¿Qué hacemos con el excedente?" del diálogo.
      // Antes esta parte solo miraba `vueltoEfectivoUsd`, así que un pago de
      // más 100% digital (ej. pago móvil) no generaba NADA — el excedente se
      // perdía sin registrar. `calcPagos.vuelto` ya lo calculaba bien.
      const excedente = calcPagos.vuelto;
      const destinoElegido = vueltoAcreditar ? "credito" : vueltoCuentaId ? "banco" : "efectivo";

      // Devolver en efectivo (destino por defecto): sale de la gaveta como
      // egreso, en la moneda que el cajero eligió. Se permite aunque esta
      // venta no haya tenido nada de efectivo (el negocio puede compensar con
      // billetes de la caja un excedente que llegó por un medio digital).
      // El monto en Bs (`excedenteBs`, memoizado arriba) se calcula sumando
      // cada pago en su moneda nativa y restando el total en Bs una sola vez
      // — no reconvirtiendo `excedente` (ya redondeado en USD) con la tasa,
      // que arrastra unos centavos cuando el pago que generó el excedente ya
      // era nativo en Bs (ver CLAUDE.md regla crítica #1 y el módulo Caja).
      const vueltoCash =
        excedente > 0.001 && destinoElegido === "efectivo"
          ? {
              monto: vueltoMoneda === "USD" ? Math.round(excedente * 100) / 100 : excedenteBs,
              moneda: vueltoMoneda,
            }
          : undefined;
      // Alternativa: el mismo excedente, entregado por una cuenta bancaria en
      // vez de efectivo — siempre en Bs (pago móvil/transferencia operan en
      // bolívares). Mutuamente excluyente con `vueltoCash`.
      const vueltoDigital =
        !offline && destinoElegido === "banco" && vueltoCuentaId && excedente > 0.001 && tasaCobro
          ? {
              cuenta_bancaria_id: vueltoCuentaId,
              monto: excedenteBs,
              moneda: "VES" as const,
            }
          : undefined;
      // Tercera alternativa: el excedente se acredita al cliente en vez de devolverse.
      const creditoOtorgado =
        !offline && destinoElegido === "credito" && clienteId && excedente > 0.001
          ? { monto: Math.round(excedente * 100) / 100 }
          : undefined;

      // Sin conexión: escribe directo en local (PowerSync) — no hay servidor
      // disponible para revalidar precios/crédito, así que se usan los datos ya
      // sincronizados al dispositivo. Se sube solo cuando vuelva la señal. Un
      // excedente que se iba a devolver por banco o acreditar y justo se pierde
      // la señal no se traslada a caja (no salió billete físico) — queda sin
      // registrar hasta reconectar.
      if (offline) {
        await confirmarVentaLocal(
          pagosEnvio,
          destinoElegido === "efectivo" ? vueltoCash : undefined,
        );
        return;
      }

      // Convertir un presupuesto reserva su conversión ANTES de crear la
      // venta — atómico (`pendiente` → `convertido` solo si sigue pendiente
      // en ese instante): si dos pestañas/dispositivos convierten el MISMO
      // presupuesto casi a la vez, la segunda se bloquea AQUÍ, antes de
      // llegar a crear una segunda venta real con su propio stock/cobro
      // duplicado. Antes esta validación solo ocurría DESPUÉS de confirmar
      // la venta (en `marcarPresupuestoConvertido`), demasiado tarde para
      // evitar el duplicado.
      if (presupuestoIdEnCurso) {
        const reserva = await reservarConversionPresupuesto(presupuestoIdEnCurso);
        if (!reserva.ok) {
          setError(reserva.error ?? "No se pudo iniciar la conversión del presupuesto.");
          return;
        }
      }

      try {
        const res = await registrarVenta({
          items: lineas.map((l) => ({
            producto_id: l.producto.id,
            cantidad: l.cantidad,
            precio_usd_override: l.precioAjustadoUsd,
            motivo_ajuste_precio: l.motivoAjustePrecio,
            iva_override: l.ivaOverride,
            igtf_override: l.igtfOverride,
          })),
          pagos: pagosEnvio,
          descuento_usd: descuentoUsd,
          sucursal_id: sucursalId ?? undefined,
          cliente_id: clienteId || null,
          tasa_override: tasaCobro && tasaCobro !== tasa ? tasaCobro : undefined,
          // Override puntual de esta venta (botones IVA/IGTF del diálogo de
          // cobro) — el servidor los usa SOLO para esta transacción, nunca
          // toca Configuración ni el producto (ver `registrarVenta`).
          igtf_activo_override: igtfOn,
          iva_activo_override: ivaOn,
          vuelto: vueltoCash,
          vuelto_digital: vueltoDigital,
          credito_otorgado: creditoOtorgado,
        });

        if (res.error || !res.ventaId) {
          // La venta con toda certeza NO se creó (error claro del servidor,
          // no una excepción de red) — libera la reserva del presupuesto
          // para que el cajero pueda corregir y reintentar.
          if (presupuestoIdEnCurso) {
            void liberarReservaPresupuesto(presupuestoIdEnCurso);
          }
          setError(res.error ?? "No se pudo completar la venta.");
          return;
        }
        // Termina de enlazar la reserva con la venta ya creada. Se llama
        // DESPUÉS de que registrarVenta confirmó con éxito — no crea la
        // venta, no toca inventario/caja/bancos/fiado, eso ya ocurrió arriba
        // sin ningún cambio.
        if (presupuestoIdEnCurso) {
          void marcarPresupuestoConvertido(presupuestoIdEnCurso, res.ventaId);
        }
        // La venta se confirmó: el borrador que la representaba (si lo hay) ya
        // no hace falta — se vuelve una fila real en mm_ventas, no una
        // pendiente. Limpia el carrito ANTES de navegar (no solo borra la
        // fila): si quedara con artículos, el salvavidas de desmontaje (ver
        // más arriba) volvería a guardarlo como "en espera" fantasma al
        // desmontarse este componente por la navegación.
        resetCarritoTrasVenta();
        router.push(`/minimarket/ventas/${res.ventaId}/recibo`);
      } catch {
        // La conexión se cortó justo al confirmar: no se pierde la venta, se
        // guarda en local con el mismo camino que el modo sin conexión. Si
        // esta venta venía de un presupuesto, su reserva (ya "convertido" sin
        // `venta_id`) queda A PROPÓSITO sin liberar: no hay forma de saber si
        // `registrarVenta` sí llegó a completarse en el servidor antes de
        // perderse la respuesta, así que es más seguro dejarlo bloqueado
        // (revisable a mano desde el detalle del presupuesto) que arriesgar
        // una segunda venta real duplicada si se reintenta la conversión.
        await confirmarVentaLocal(
          pagosEnvio,
          destinoElegido === "efectivo" ? vueltoCash : undefined,
        );
      }
    });
  }

  async function confirmarVentaLocal(
    pagosEnvio: { metodo: MmMetodoPago; monto: number; moneda: "USD" | "VES" }[],
    vuelto?: { monto: number; moneda: "USD" | "VES" },
  ) {
    if (!powerSyncDb) {
      setError("Sin conexión y sin base local disponible. Inténtalo de nuevo en unos segundos.");
      return;
    }
    if (!tasaCobro || !sucursalId) {
      setError("Sin conexión: falta la tasa o la sucursal para poder vender.");
      return;
    }

    const fiadoMonto = pagosEnvio.find((p) => p.metodo === "fiado")?.monto ?? 0;
    if (fiadoMonto > 0.001 && clienteId) {
      const cliente = clientes.find((c) => c.id === clienteId);
      const yaAcumulado = fiadoOfflineRef.current.get(clienteId) ?? 0;
      const limite = cliente?.limite_fiado_usd ?? 0;
      const saldoConocido = (cliente?.saldo_usd ?? 0) + yaAcumulado;
      if (limite > 0 && saldoConocido + fiadoMonto > limite + 0.001) {
        setError(
          `Esta operación ($${fiadoMonto.toFixed(2)} a fiado) supera el límite de ${cliente?.nombre ?? "este cliente"} ($${limite.toFixed(2)}) con los datos que hay en este dispositivo. Disponible: $${Math.max(0, limite - saldoConocido).toFixed(2)}.`,
        );
        return;
      }
    }

    try {
      const { numeroDocumento } = await registrarVentaLocal(powerSyncDb, {
        tenantId,
        usuarioId,
        sucursalId,
        clienteId: clienteId || null,
        items: lineas.map((l) => ({
          productoId: l.producto.id,
          descripcion: l.producto.nombre,
          cantidad: l.cantidad,
          precioUsd: precioUnitarioLinea(l),
          // Efectivo (con el override puntual de esta venta, si lo hay) —
          // offline no hay servidor para resolverlo, así que se congela aquí.
          impuestoId: impuestoIdEfectivoLinea(l),
          aplicaIgtf: lineaAplicaIgtf(l),
          precioAjustado: l.precioAjustadoUsd !== undefined,
          motivoAjustePrecio: l.motivoAjustePrecio ?? null,
        })),
        pagos: pagosEnvio,
        tasa: tasaCobro,
        subtotalUsd: subtotalNeto,
        descuentoUsd,
        igtfUsd: calcPagos.igtf,
        totalUsd: calcPagos.totalUsd,
        totalBs: calcPagos.totalBs,
        fiadoMonto,
        vuelto,
      });

      if (fiadoMonto > 0.001 && clienteId) {
        const previo = fiadoOfflineRef.current.get(clienteId) ?? 0;
        fiadoOfflineRef.current.set(clienteId, previo + fiadoMonto);
      }

      setVentaOffline({
        numeroDocumento,
        totalUsd: calcPagos.totalUsd,
        totalBs: calcPagos.totalBs,
      });
      resetCarritoTrasVenta();
    } catch (err) {
      setError(
        err instanceof Error
          ? `No se pudo guardar la venta en el dispositivo: ${err.message}`
          : "No se pudo guardar la venta en el dispositivo.",
      );
    }
  }

  return (
    <div className={`space-y-4 ${lineas.length > 0 ? "pb-24 lg:pb-0" : ""}`}>
      {/* Ventas en espera: acceso directo a los cobros dejados a medias */}
      <div className="flex justify-end">
        <VentasEnEsperaBoton
          db={powerSyncDb}
          sucursalId={sucursalId}
          locale={locale}
          clientes={clientes}
          onRetomar={(venta) => void retomarVentaPendiente(venta)}
        />
      </div>

      {/* Presupuesto en conversión: aviso de stock, nunca bloquea (mismo
          criterio que el resto del POS — solo informa). */}
      {presupuestoIdEnCurso && avisosStockPresupuesto.length > 0 ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <strong>Stock insuficiente</strong> para lo cotizado en este presupuesto:{" "}
            {avisosStockPresupuesto
              .map((a) => `${a.nombre} (pedido ${a.cantidadPedida}, quedan ${a.stockActual})`)
              .join(", ")}
            . Ajusta las cantidades antes de cobrar si hace falta.
          </span>
        </div>
      ) : null}

      {/* Banner offline */}
      {offline ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <WifiOff className="size-4 shrink-0" aria-hidden />
          <span>
            <strong>Sin conexión</strong> — Puedes vender igual. La venta se guarda en este
            dispositivo y se sube sola cuando vuelva la señal.
          </span>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        {/* ── Catálogo ── */}
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search
                className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const q = query.trim();
                    if (q) {
                      agregarPorCodigo(q);
                      setQuery("");
                    }
                  }
                }}
                placeholder="Buscar producto por nombre o código…"
                className="pl-9"
                aria-label="Buscar productos"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => {
                setScannerError(null);
                setScanNotFound(null);
                setScannerOpen(true);
              }}
              aria-label="Escanear código de barras con la cámara"
              title="Escanear código de barras"
            >
              <Scan className="size-4" />
            </Button>
            <BotonCalculadora onClick={() => setCalculadoraOpen(true)} />
          </div>

          {scanNotFound ? (
            <p role="alert" className="bg-warning/10 text-warning rounded-md px-3 py-2 text-sm">
              Código &quot;{scanNotFound}&quot; no encontrado en inventario.
            </p>
          ) : null}

          {/* ── Frecuentes — solo si no hay búsqueda activa ── */}
          {frecuentes.length > 0 && !query.trim() ? (
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Frecuentes
              </p>
              <div className="flex flex-wrap gap-2">
                {frecuentes.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => agregar(p)}
                    className="border-border bg-surface hover:border-accent-400 hover:bg-accent-50 flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2"
                  >
                    <span className="text-heading max-w-[120px] truncate font-medium">
                      {p.nombre}
                    </span>
                    <span className="text-accent-600 shrink-0 text-xs tabular-nums">
                      {money(Number(p.precio_usd), "USD")}
                      {p.tipo_venta === "granel" ? ` / ${p.unidad}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {filtrados.length === 0 ? (
            <Card className="text-muted-foreground p-10 text-center text-sm">
              No hay productos. Crea algunos en{" "}
              <Link href="/minimarket/inventario" className="underline">
                Inventario
              </Link>
              .
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {filtrados.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => agregar(p)}
                  className="border-border bg-surface hover:border-accent-500 focus-visible:ring-ring flex flex-col overflow-hidden rounded-xl border text-left transition-colors focus-visible:outline-none focus-visible:ring-2"
                >
                  <div className="bg-surface-2 relative aspect-square w-full">
                    {p.imagen_url ? (
                      <Image
                        src={p.imagen_url}
                        alt={p.nombre}
                        fill
                        sizes="160px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="text-muted-foreground/50 flex size-full items-center justify-center">
                        <ImageIcon className="size-8" aria-hidden />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-0.5 p-2.5">
                    <p className="text-heading line-clamp-2 text-sm font-medium leading-tight">
                      {p.nombre}
                      {p.tipo_venta === "granel" ? (
                        <span className="text-accent-600 ml-1 text-xs font-normal">(a granel)</span>
                      ) : null}
                    </p>
                    <p className="text-accent-600 mt-auto text-sm font-semibold tabular-nums">
                      {money(Number(p.precio_usd), "USD")}
                      {p.tipo_venta === "granel" ? ` / ${p.unidad}` : ""}
                    </p>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {tasa ? money(Number(p.precio_usd) * tasa, "VES") : "—"}
                      {p.tipo_venta === "granel" && tasa ? ` / ${p.unidad}` : ""}
                    </p>
                    <p
                      className={`text-xs tabular-nums ${p.bajo_minimo ? "text-warning" : "text-muted-foreground"}`}
                    >
                      Stock: {formatStock(p)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Carrito ── */}
        <Card className="flex h-fit flex-col gap-3 p-4 lg:sticky lg:top-20">
          <div className="text-heading flex items-center gap-2 font-medium">
            <ShoppingCart className="text-accent-600 size-5" aria-hidden />
            Carrito
            {lineas.length > 0 ? (
              <span className="text-muted-foreground text-sm font-normal">
                ({lineas.reduce((s, l) => s + l.cantidad, 0)})
              </span>
            ) : null}
          </div>

          {lineas.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Toca un producto para agregarlo.
            </p>
          ) : (
            <ul className="divide-border max-h-[40vh] divide-y overflow-y-auto">
              {lineas.map((l) => (
                <li key={l.producto.id} className="flex items-center gap-2 py-2">
                  <div className="bg-surface-2 relative size-10 shrink-0 overflow-hidden rounded-md">
                    {l.producto.imagen_url ? (
                      <Image
                        src={l.producto.imagen_url}
                        alt={l.producto.nombre}
                        fill
                        sizes="40px"
                        loading="lazy"
                        className="object-cover"
                      />
                    ) : (
                      <div className="text-muted-foreground/50 flex size-full items-center justify-center">
                        <ImageIcon className="size-4" aria-hidden />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-heading truncate text-sm font-medium">{l.producto.nombre}</p>
                    {l.precioAjustadoUsd !== undefined ? (
                      <p className="text-xs tabular-nums">
                        <span className="text-muted-foreground line-through">
                          {money(Number(l.producto.precio_usd), "USD")}
                        </span>{" "}
                        <span className="font-medium text-amber-600">
                          {money(l.precioAjustadoUsd, "USD")} c/u
                        </span>
                        <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                          Ajustado
                        </span>
                      </p>
                    ) : (
                      <p className="text-muted-foreground text-xs tabular-nums">
                        {money(Number(l.producto.precio_usd), "USD")} c/u
                      </p>
                    )}
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => alternarIvaLinea(l.producto.id)}
                        aria-pressed={lineaAplicaIva(l)}
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          lineaAplicaIva(l)
                            ? "bg-surface-2 text-muted-foreground"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {lineaAplicaIva(l) ? "IVA" : "Sin IVA (esta venta)"}
                      </button>
                      <button
                        type="button"
                        onClick={() => alternarIgtfLinea(l.producto.id)}
                        aria-pressed={lineaAplicaIgtf(l)}
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          lineaAplicaIgtf(l)
                            ? "bg-surface-2 text-muted-foreground"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {lineaAplicaIgtf(l) ? "IGTF" : "Sin IGTF (esta venta)"}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {puedeAjustarPrecio ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Ajustar precio de ${l.producto.nombre}`}
                        onClick={() => abrirEditarPrecio(l)}
                      >
                        <Pencil className="text-muted-foreground size-3.5" />
                      </Button>
                    ) : null}
                    {l.producto.tipo_venta === "granel" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 px-2 text-xs tabular-nums"
                        aria-label={`Editar cantidad de ${l.producto.nombre}`}
                        onClick={() => editarGranel(l)}
                      >
                        <Pencil className="size-3.5" />
                        {formatCantidadLinea(l)}
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-8"
                          aria-label="Quitar uno"
                          onClick={() => cambiar(l.producto.id, -1)}
                        >
                          <Minus className="size-3.5" />
                        </Button>
                        <span className="w-6 text-center text-sm tabular-nums">
                          {formatCantidadLinea(l)}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-8"
                          aria-label="Agregar uno"
                          onClick={() => cambiar(l.producto.id, 1)}
                        >
                          <Plus className="size-3.5" />
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={`Quitar ${l.producto.nombre}`}
                      onClick={() => quitar(l.producto.id)}
                    >
                      <Trash2 className="text-danger size-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Descuento */}
          {lineas.length > 0 ? (
            <div className="border-border border-t pt-3">
              <p className="text-muted-foreground mb-2 text-xs font-medium">Descuento (opcional)</p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs">
                    %
                  </span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    max="100"
                    value={descPct}
                    onChange={(e) => {
                      setDescPct(e.target.value);
                      const p = parseFloat(e.target.value);
                      if (Number.isFinite(p) && p >= 0) {
                        setDescMonto(
                          String(Math.round((Math.min(p, 100) / 100) * subtotalBruto * 100) / 100),
                        );
                      }
                    }}
                    placeholder="0"
                    className="pl-7 text-sm"
                    aria-label="Descuento en porcentaje"
                  />
                </div>
                <div className="relative flex-1">
                  <span className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs">
                    $
                  </span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={descMonto}
                    onChange={(e) => {
                      setDescMonto(e.target.value);
                      const m = parseFloat(e.target.value);
                      if (Number.isFinite(m) && m >= 0 && subtotalBruto > 0) {
                        setDescPct(
                          String(
                            Math.round((Math.min(m, subtotalBruto) / subtotalBruto) * 10000) / 100,
                          ),
                        );
                      }
                    }}
                    placeholder="0.00"
                    className="pl-7 text-sm"
                    aria-label="Descuento en dólares"
                  />
                </div>
              </div>
            </div>
          ) : null}

          {/* Selector de cliente (carrito) */}
          <div className="border-border border-t pt-3">
            <p className="text-muted-foreground mb-1.5 text-xs font-medium">
              Cliente <span className="font-normal">(opcional)</span>
            </p>
            {clienteSeleccionado ? (
              <div className="border-border bg-surface-2 flex items-center justify-between rounded-md border px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <UserCheck className="text-accent-600 size-4 shrink-0" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-heading truncate text-sm font-medium">
                      {clienteSeleccionado.nombre}
                    </p>
                    {clienteSeleccionado.cedula ? (
                      <p className="text-muted-foreground text-xs">
                        CI {clienteSeleccionado.cedula}
                      </p>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Quitar cliente"
                  onClick={() => {
                    setClienteId("");
                    setClienteQuery("");
                    setPagos((prev) =>
                      prev.map((p) =>
                        p.metodo === "fiado"
                          ? trasladarSaldoDesdeFiado(p, metodoPorDefecto, prev)
                          : p,
                      ),
                    );
                  }}
                  className="text-muted-foreground hover:text-heading ml-2 shrink-0"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <div ref={clienteRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setClienteDropdown((v) => !v);
                    setClienteQuery("");
                  }}
                  className="border-border bg-background text-muted-foreground focus-visible:ring-ring flex h-10 w-full items-center justify-between rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2"
                >
                  <span>Buscar cliente…</span>
                  <ChevronDown className="size-4 shrink-0" aria-hidden />
                </button>

                {clienteDropdown ? (
                  <div className="border-border bg-surface absolute z-50 mt-1 w-full rounded-md border shadow-lg">
                    <div className="p-2">
                      <Input
                        value={clienteQuery}
                        onChange={(e) => setClienteQuery(e.target.value)}
                        placeholder="Nombre o cédula…"
                        className="h-8 text-sm"
                      />
                    </div>
                    <ul className="max-h-48 overflow-y-auto pb-1">
                      {clientesFiltrados.length === 0 ? (
                        <li className="text-muted-foreground px-3 py-2 text-sm">Sin resultados.</li>
                      ) : (
                        clientesFiltrados.map((c) => {
                          const disponible = Math.max(0, c.limite_fiado_usd - c.saldo_usd);
                          return (
                            <li key={c.id}>
                              <button
                                type="button"
                                className="hover:bg-surface-2 flex w-full items-start gap-2 px-3 py-2 text-left"
                                onClick={() => {
                                  setClienteId(c.id);
                                  setClienteDropdown(false);
                                  setClienteQuery("");
                                }}
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-heading text-sm font-medium">{c.nombre}</p>
                                  {c.cedula ? (
                                    <p className="text-muted-foreground text-xs">CI {c.cedula}</p>
                                  ) : null}
                                </div>
                                {c.limite_fiado_usd > 0 ? (
                                  <span className="text-muted-foreground mt-0.5 shrink-0 text-xs tabular-nums">
                                    fiado: ${disponible.toFixed(2)} disp.
                                  </span>
                                ) : null}
                              </button>
                            </li>
                          );
                        })
                      )}
                    </ul>
                    <div className="border-border border-t p-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setClienteDropdown(false);
                          setCrearClienteOpen(true);
                        }}
                        className="text-accent-600 hover:bg-accent-50 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm font-medium"
                      >
                        <PlusCircle className="size-4 shrink-0" aria-hidden />
                        Crear cliente nuevo
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* Subtotales carrito */}
          <div className="border-border space-y-1 border-t pt-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="text-heading font-display text-lg font-semibold tabular-nums">
                {money(subtotalNeto, "USD")}
              </span>
            </div>
            {descuentoUsd > 0 ? (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Descuento ({descPctNum.toFixed(1)}%)</span>
                <span className="text-success tabular-nums">−{money(descuentoUsd, "USD")}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Bs (aprox.)</span>
              <span className="tabular-nums">{tasa ? money(subtotalNetoBs, "VES") : "—"}</span>
            </div>
          </div>

          {!tasa ? (
            <p className="bg-warning/15 text-warning rounded-md px-3 py-2 text-xs">
              Define la{" "}
              <Link href="/minimarket/tasa" className="underline">
                tasa del día
              </Link>{" "}
              para poder cobrar.
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={lineas.length === 0}
              onClick={() => setDejarEnEsperaOpen(true)}
              className="shrink-0"
              title="Dejar esta venta en espera para atender otra"
            >
              <Clock3 className="mr-1.5 size-4" aria-hidden />
              En espera
            </Button>
            <Button
              size="lg"
              disabled={lineas.length === 0 || !tasa}
              onClick={abrirCobro}
              className="flex-1"
            >
              Cobrar
            </Button>
          </div>
        </Card>

        {/* ── Modal escáner de cámara ── */}
        <Dialog open={scannerOpen} onOpenChange={(o) => !o && setScannerOpen(false)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Escanear código de barras</DialogTitle>
              <DialogDescription>
                Apunta la cámara al código del producto. Se agrega automáticamente al carrito.
              </DialogDescription>
            </DialogHeader>
            {scannerError ? (
              <p
                role="alert"
                className="bg-danger/10 text-danger flex items-start gap-2 rounded-md px-3 py-2.5 text-sm"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {scannerError}
              </p>
            ) : (
              <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
                <video
                  ref={videoRef}
                  className="h-full w-full object-cover"
                  playsInline
                  muted
                  aria-label="Vista de la cámara para escanear"
                />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-32 w-48 rounded-lg border-2 border-white/60" />
                </div>
              </div>
            )}
            {scanNotFound ? (
              <p className="text-warning text-sm">
                Código &quot;{scanNotFound}&quot; no encontrado en inventario.
              </p>
            ) : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => setScannerOpen(false)}>
                Cerrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Diálogo de cobro ── */}
        <Dialog
          open={cobrarOpen}
          onOpenChange={(o) => {
            if (pending) return;
            if (o) {
              setCobrarOpen(true);
              return;
            }
            // Cierre disparado como efecto colateral de cerrar un modal hijo
            // (ver `cerrarEditarPrecio`) — se ignora una sola vez, el diálogo
            // de cobro se queda abierto y la venta sigue normal.
            if (ignorarProximoCierreCobroRef.current) {
              ignorarProximoCierreCobroRef.current = false;
              return;
            }
            void cerrarCobroSinConfirmar();
          }}
        >
          <DialogContent className="sm:max-w-lg lg:max-w-4xl">
            <div className="flex items-start justify-between gap-2">
              <DialogHeader className="flex-1">
                <DialogTitle>Cobrar venta</DialogTitle>
                <DialogDescription>
                  {lineas.reduce((s, l) => s + l.cantidad, 0)} artículo(s)
                  {descuentoUsd > 0 ? ` · descuento $${descuentoUsd.toFixed(2)}` : ""}
                </DialogDescription>
              </DialogHeader>
              <BotonCalculadora
                onClick={() => setCalculadoraOpen(true)}
                className="mt-0.5 shrink-0"
              />
            </div>

            {/* Total prominente + tasa de esta venta (elegible entre las 3 configuradas) —
                arriba de todo, a todo el ancho: el cajero debe verlo de inmediato. */}
            <div className="bg-accent-50 border-accent-200 min-w-0 rounded-lg border px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-heading font-medium">Total a cobrar</span>
                <label className="bg-accent-100 text-accent-700 flex max-w-full items-center gap-1.5 rounded px-2 py-0.5 text-xs font-semibold">
                  Tasa
                  <select
                    aria-label="Tasa de cambio para esta venta"
                    value={tasaCobroTipo}
                    onChange={(e) => setTasaCobroTipo(e.target.value as TipoTasa)}
                    className="text-accent-700 focus-visible:ring-accent-400 bg-surface min-w-0 max-w-[11rem] rounded border-0 py-0.5 pl-1 pr-5 outline-none focus-visible:ring-2 sm:max-w-none"
                  >
                    {(Object.keys(TIPO_TASA_LABEL) as TipoTasa[]).map((tipo) => {
                      const valorTipo = tasas[tipo];
                      return (
                        <option key={tipo} value={tipo} disabled={valorTipo == null}>
                          {TIPO_TASA_LABEL[tipo]}
                          {valorTipo != null ? ` — Bs ${valorTipo.toFixed(2)}` : " — sin registrar"}
                        </option>
                      );
                    })}
                  </select>
                </label>
              </div>
              <div className="mt-1.5 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                <p className="text-accent-700 font-display text-2xl font-bold tabular-nums">
                  {money(calcPagos.totalUsd, "USD")}
                </p>
                {tasaCobro ? (
                  <p className="text-accent-600 pb-0.5 text-base font-semibold tabular-nums">
                    {money(calcPagos.totalBs, "VES")}
                  </p>
                ) : null}
              </div>
              {tasaCobroTipo !== fuentePreferida ? (
                <p className="text-accent-700/80 mt-1 text-xs">
                  La tasa predeterminada es {TIPO_TASA_LABEL[fuentePreferida]}. Estás cobrando esta
                  venta con {TIPO_TASA_LABEL[tasaCobroTipo]}.
                </p>
              ) : null}
              {!tasaCobro ? (
                <p className="text-danger mt-1 text-xs">
                  Esa tasa no tiene un valor registrado. Elige otra o regístrala en Tasa de cambio.
                </p>
              ) : null}
            </div>

            {offline ? (
              <div
                role="status"
                className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800"
              >
                <WifiOff className="size-3.5 shrink-0" aria-hidden />
                Sin conexión — al confirmar, la venta se guarda en este dispositivo y se sube sola
                cuando vuelva la señal.
              </div>
            ) : null}

            {error ? (
              <p
                role="alert"
                className="bg-danger/10 text-danger flex items-center gap-2 rounded-md px-3 py-2.5 text-sm"
              >
                <AlertCircle className="size-4 shrink-0" aria-hidden />
                {error}
              </p>
            ) : null}

            {/* Contenido principal: en escritorio ancho, formas de pago a la izquierda y el
                resumen a la derecha, para aprovechar el espacio en vez de apilar todo. */}
            <div className="min-w-0 space-y-4 lg:grid lg:grid-cols-[3fr_2fr] lg:items-start lg:gap-x-6 lg:space-y-0">
              <div className="min-w-0 space-y-4">
                {/* Buscador: agregar más productos sin cerrar el diálogo de cobro */}
                <div className="relative">
                  <div className="relative">
                    <Search
                      className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
                      aria-hidden
                    />
                    <Input
                      value={busquedaCobro}
                      onChange={(e) => setBusquedaCobro(e.target.value)}
                      placeholder="¿Algo más? Busca por nombre o código…"
                      className="pl-9"
                      aria-label="Buscar productos para agregar a esta venta"
                    />
                  </div>
                  {resultadosCobro.length > 0 ? (
                    <ul className="border-border bg-surface absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-lg border shadow-lg">
                      {resultadosCobro.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => {
                              agregar(p);
                              setBusquedaCobro("");
                            }}
                            className="hover:bg-surface-2 flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors"
                          >
                            <div className="bg-surface-2 relative size-10 shrink-0 overflow-hidden rounded-md">
                              {p.imagen_url ? (
                                <Image
                                  src={p.imagen_url}
                                  alt={p.nombre}
                                  fill
                                  sizes="40px"
                                  className="object-cover"
                                />
                              ) : (
                                <div className="text-muted-foreground/50 flex size-full items-center justify-center">
                                  <ImageIcon className="size-4" aria-hidden />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-heading truncate text-sm font-medium">
                                {p.nombre}
                              </p>
                              <p className="text-accent-600 text-xs font-semibold tabular-nums">
                                {money(Number(p.precio_usd), "USD")}
                                {tasa ? ` · ${money(Number(p.precio_usd) * tasa, "VES")}` : ""}
                                {p.tipo_venta === "granel" ? ` / ${p.unidad}` : ""}
                              </p>
                              <p
                                className={`text-xs tabular-nums ${p.bajo_minimo ? "text-warning" : "text-muted-foreground"}`}
                              >
                                Stock: {formatStock(p)}
                              </p>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : busquedaCobro.trim() ? (
                    <p className="text-muted-foreground border-border bg-surface absolute inset-x-0 top-full z-10 mt-1 rounded-lg border px-3 py-2 text-sm shadow-lg">
                      Sin resultados para &quot;{busquedaCobro.trim()}&quot;.
                    </p>
                  ) : null}
                </div>

                {/* Detalle del carrito: ver/editar cantidades sin cerrar el diálogo de cobro */}
                {lineas.length > 0 ? (
                  <div className="border-border rounded-lg border">
                    <button
                      type="button"
                      onClick={() => setDetalleCarritoAbierto((v) => !v)}
                      className="text-heading flex w-full items-center justify-between gap-2 px-3 py-2 text-sm font-medium"
                      aria-expanded={detalleCarritoAbierto}
                    >
                      <span>Ver productos ({lineas.reduce((s, l) => s + l.cantidad, 0)})</span>
                      <ChevronDown
                        className={`size-4 transition-transform ${detalleCarritoAbierto ? "rotate-180" : ""}`}
                        aria-hidden
                      />
                    </button>
                    {detalleCarritoAbierto ? (
                      <ul className="divide-border max-h-[30vh] divide-y overflow-y-auto border-t px-3">
                        {lineas.map((l) => (
                          <li key={l.producto.id} className="flex items-center gap-2 py-2">
                            <div className="bg-surface-2 relative size-10 shrink-0 overflow-hidden rounded-md">
                              {l.producto.imagen_url ? (
                                <Image
                                  src={l.producto.imagen_url}
                                  alt={l.producto.nombre}
                                  fill
                                  sizes="40px"
                                  loading="lazy"
                                  className="object-cover"
                                />
                              ) : (
                                <div className="text-muted-foreground/50 flex size-full items-center justify-center">
                                  <ImageIcon className="size-4" aria-hidden />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-heading truncate text-sm font-medium">
                                {l.producto.nombre}
                              </p>
                              {l.precioAjustadoUsd !== undefined ? (
                                <p className="text-xs tabular-nums">
                                  <span className="text-muted-foreground line-through">
                                    {money(Number(l.producto.precio_usd), "USD")}
                                  </span>{" "}
                                  <span className="font-medium text-amber-600">
                                    {money(l.precioAjustadoUsd, "USD")} c/u
                                  </span>
                                  <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                                    Ajustado
                                  </span>
                                </p>
                              ) : (
                                <p className="text-muted-foreground text-xs tabular-nums">
                                  {money(Number(l.producto.precio_usd), "USD")} c/u
                                </p>
                              )}
                              <div className="mt-0.5 flex flex-wrap items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => alternarIvaLinea(l.producto.id)}
                                  aria-pressed={lineaAplicaIva(l)}
                                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                    lineaAplicaIva(l)
                                      ? "bg-surface-2 text-muted-foreground"
                                      : "bg-amber-100 text-amber-700"
                                  }`}
                                >
                                  {lineaAplicaIva(l) ? "IVA" : "Sin IVA (esta venta)"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => alternarIgtfLinea(l.producto.id)}
                                  aria-pressed={lineaAplicaIgtf(l)}
                                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                    lineaAplicaIgtf(l)
                                      ? "bg-surface-2 text-muted-foreground"
                                      : "bg-amber-100 text-amber-700"
                                  }`}
                                >
                                  {lineaAplicaIgtf(l) ? "IGTF" : "Sin IGTF (esta venta)"}
                                </button>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {puedeAjustarPrecio ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8"
                                  aria-label={`Ajustar precio de ${l.producto.nombre}`}
                                  onClick={() => abrirEditarPrecio(l)}
                                >
                                  <Pencil className="text-muted-foreground size-3.5" />
                                </Button>
                              ) : null}
                              {l.producto.tipo_venta === "granel" ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 gap-1.5 px-2 text-xs tabular-nums"
                                  aria-label={`Editar cantidad de ${l.producto.nombre}`}
                                  onClick={() => editarGranel(l)}
                                >
                                  <Pencil className="size-3.5" />
                                  {formatCantidadLinea(l)}
                                </Button>
                              ) : (
                                <>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="size-8"
                                    aria-label="Quitar uno"
                                    onClick={() => cambiar(l.producto.id, -1)}
                                  >
                                    <Minus className="size-3.5" />
                                  </Button>
                                  <span className="w-6 text-center text-sm tabular-nums">
                                    {formatCantidadLinea(l)}
                                  </span>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="size-8"
                                    aria-label="Agregar uno"
                                    onClick={() => cambiar(l.producto.id, 1)}
                                  >
                                    <Plus className="size-3.5" />
                                  </Button>
                                </>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                aria-label={`Quitar ${l.producto.nombre}`}
                                onClick={() => quitar(l.producto.id)}
                              >
                                <Trash2 className="text-danger size-3.5" />
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}

                {/* Formas de pago */}
                <div className="space-y-2">
                  <Label>Formas de pago</Label>
                  <div className="space-y-2">
                    {pagos.map((pago) => {
                      const esFiado = pago.metodo === "fiado";
                      const esCredito = pago.metodo === "credito_cliente";
                      const monedaPago = monedaDe(pago.metodo);
                      const monedaLabel = monedaPago === "VES" ? "Bs" : "USD";
                      const tieneDatosPago = METODOS_CON_DATOS_PAGO.has(pago.metodo);
                      const panelAbierto = panelWhatsappKey === pago.key;
                      const metodoActualInfo = metodosPagoActivos.find(
                        (m) => m.value === pago.metodo,
                      );
                      const esCasheaActual = pago.metodo === "cashea";

                      return (
                        <div
                          key={pago.key}
                          className="border-border min-w-0 space-y-2.5 rounded-lg border p-3"
                        >
                          {/* Fila 1: método de pago + acciones de la fila */}
                          <div className="flex min-w-0 items-center gap-1.5">
                            {/* Select nativo reemplazado por un menú propio: un
                                <option> no puede llevar logo ni color de marca,
                                y Cashea necesita distinguirse de un vistazo. */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  aria-label="Método de pago"
                                  className={cn(
                                    SELECT_CLASS,
                                    "flex min-w-0 flex-1 items-center justify-between gap-2 text-left",
                                    esCasheaActual &&
                                      "border-transparent bg-black text-[#FFCC00] hover:bg-black/90 focus-visible:ring-[#FFCC00]",
                                  )}
                                >
                                  <span className="flex min-w-0 items-center gap-1.5">
                                    {esCasheaActual ? (
                                      <Image
                                        src={CASHEA_LOGO_SRC}
                                        alt=""
                                        width={18}
                                        height={18}
                                        className="shrink-0 rounded-sm"
                                      />
                                    ) : null}
                                    <span className="truncate">
                                      {esCredito
                                        ? "Saldo a favor"
                                        : (metodoActualInfo?.label ?? pago.metodo)}
                                    </span>
                                  </span>
                                  <ChevronDown
                                    className={`size-4 shrink-0 ${esCasheaActual ? "opacity-80" : "opacity-60"}`}
                                    aria-hidden
                                  />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="start"
                                className="max-h-[70vh] overflow-y-auto"
                              >
                                {metodosPagoActivos.map((m) => {
                                  const deshabilitado =
                                    m.value === "fiado" && tieneFiado && pago.metodo !== "fiado";
                                  const esCashea = m.value === "cashea";
                                  const seleccionado = pago.metodo === m.value;
                                  return (
                                    <DropdownMenuItem
                                      key={m.value}
                                      disabled={deshabilitado}
                                      onSelect={() => cambiarMetodoPago(pago.key, m.value)}
                                      className={esCashea ? CASHEA_CLASSES : undefined}
                                    >
                                      {esCashea ? (
                                        <Image
                                          src={CASHEA_LOGO_SRC}
                                          alt=""
                                          width={18}
                                          height={18}
                                          className="shrink-0 rounded-sm"
                                        />
                                      ) : null}
                                      <span className="flex-1 truncate">{m.label}</span>
                                      {seleccionado ? (
                                        <Check className="size-4 shrink-0" aria-hidden />
                                      ) : null}
                                    </DropdownMenuItem>
                                  );
                                })}
                              </DropdownMenuContent>
                            </DropdownMenu>

                            {tieneDatosPago ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    aria-label="Enviar los datos de pago al cliente por WhatsApp"
                                    onClick={() => {
                                      if (panelAbierto) {
                                        setPanelWhatsappKey(null);
                                      } else {
                                        setPanelWhatsappKey(pago.key);
                                        setWaOtroNumero(false);
                                        setWaNumeroPersonalizado("");
                                      }
                                    }}
                                    className={`shrink-0 rounded p-1.5 transition-colors ${
                                      panelAbierto
                                        ? "bg-success/15 text-success"
                                        : "text-muted-foreground hover:bg-success/10 hover:text-success"
                                    }`}
                                  >
                                    <WhatsAppIcon className="size-4" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Enviar los datos de pago al cliente por WhatsApp
                                </TooltipContent>
                              </Tooltip>
                            ) : null}

                            {pagos.length > 1 ? (
                              <button
                                type="button"
                                aria-label="Quitar este método"
                                onClick={() => quitarFilaPago(pago.key)}
                                className="text-muted-foreground hover:text-danger shrink-0"
                              >
                                <X className="size-4" />
                              </button>
                            ) : (
                              <span className="size-4 shrink-0" />
                            )}
                          </div>

                          {/* Fila 2: monto — con espacio completo para escribir cómodo */}
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="relative min-w-0 flex-1">
                              <span className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm">
                                {monedaLabel}
                              </span>
                              <Input
                                type="text"
                                inputMode="numeric"
                                value={formatMaskedAmount(pago.monto)}
                                onChange={(e) =>
                                  cambiarMontoPago(pago.key, parseMaskedInput(e.target.value))
                                }
                                placeholder={
                                  esFiado && calcPagos.fiadoMonto > 0
                                    ? formatMaskedAmount(calcPagos.fiadoMonto.toFixed(2))
                                    : "0,00"
                                }
                                className="h-11 w-full pl-11 pr-3 text-right text-base tabular-nums"
                                aria-label={`Monto en ${monedaLabel}`}
                              />
                            </div>

                            {/* Botón saldo exacto */}
                            <button
                              type="button"
                              onClick={() => sugerirSaldo(pago.key)}
                              title="Rellenar con el monto exacto para cubrir el saldo"
                              className="bg-accent-50 text-accent-700 hover:bg-accent-100 h-11 shrink-0 rounded-md px-2.5 text-xs font-medium transition-colors"
                            >
                              ← saldo
                            </button>
                          </div>

                          {/* Fila 3: a qué cuenta entra este pago — solo online y solo
                              si el negocio configuró más de una cuenta para este método;
                              con una sola (o ninguna) queda asignada en silencio. */}
                          {!offline && esMetodoConCuenta(pago.metodo)
                            ? (() => {
                                const cuentasDelMetodo = cuentasPorMetodo(pago.metodo);
                                if (cuentasDelMetodo.length <= 1) return null;
                                return (
                                  <div className="space-y-1">
                                    <select
                                      value={pago.cuentaBancariaId ?? ""}
                                      onChange={(e) => cambiarCuentaPago(pago.key, e.target.value)}
                                      className={SELECT_CLASS}
                                      aria-label="Cuenta bancaria que recibe este pago"
                                    >
                                      {cuentasDelMetodo.map((c) => (
                                        <option key={c.id} value={c.id}>
                                          {c.banco} — {c.titular}
                                          {c.predeterminada ? " (predeterminada)" : ""}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                );
                              })()
                            : null}

                          {panelAbierto ? (
                            <div className="border-success/30 bg-success/5 space-y-2 rounded-lg border p-3">
                              <label className="flex items-center gap-2 text-xs">
                                <input
                                  type="checkbox"
                                  checked={waOtroNumero}
                                  onChange={(e) => setWaOtroNumero(e.target.checked)}
                                  className="accent-success size-3.5"
                                />
                                Enviar a otro número
                              </label>
                              {waOtroNumero ? (
                                <Input
                                  type="tel"
                                  inputMode="tel"
                                  placeholder="ej. 0412-1234567"
                                  value={waNumeroPersonalizado}
                                  onChange={(e) => setWaNumeroPersonalizado(e.target.value)}
                                  className="text-sm"
                                  aria-label="Número de WhatsApp"
                                />
                              ) : (
                                <p className="text-muted-foreground text-xs">
                                  {clienteSeleccionado?.whatsapp || clienteSeleccionado?.telefono
                                    ? `Se enviará al WhatsApp de ${clienteSeleccionado.nombre} (${clienteSeleccionado.whatsapp || clienteSeleccionado.telefono}).`
                                    : 'Selecciona un cliente con WhatsApp registrado, o marca "Enviar a otro número".'}
                                </p>
                              )}
                              <Button
                                type="button"
                                size="sm"
                                className="w-full gap-1.5"
                                onClick={() => enviarDatosPagoWhatsApp(pago)}
                              >
                                <WhatsAppIcon className="size-3.5" aria-hidden />
                                Enviar datos de pago
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  {pagos.every((p) => p.monto === "") ? (
                    <p className="text-muted-foreground text-xs">
                      Usa el botón <span className="text-accent-700 font-medium">← saldo</span> para
                      completar el monto automáticamente.
                    </p>
                  ) : null}

                  {pagos.length < 4 ? (
                    <button
                      type="button"
                      onClick={agregarFilaPago}
                      className="text-accent-600 hover:text-accent-700 flex items-center gap-1.5 text-sm"
                    >
                      <PlusCircle className="size-4" aria-hidden />
                      Agregar otra forma de pago
                    </button>
                  ) : null}

                  {/* Acción destacada: usar el saldo a favor del cliente (un toque). Solo
                puede haber si ya hay un cliente seleccionado con saldo — nunca aparece
                deshabilitado, simplemente no se muestra si no aplica. */}
                  {!pagos.some((p) => p.metodo === "credito_cliente") &&
                  saldoFavorCliente > 0.001 &&
                  pagos.length < 4 ? (
                    <button
                      type="button"
                      onClick={usarSaldoFavor}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-left transition-colors hover:bg-emerald-100"
                    >
                      <span className="flex items-center gap-2">
                        <Wallet className="size-4 shrink-0 text-emerald-600" aria-hidden />
                        <span className="text-sm font-medium text-emerald-800">
                          Usar saldo a favor de {clienteSeleccionado?.nombre}
                        </span>
                      </span>
                      <span className="text-right text-sm font-semibold tabular-nums text-emerald-700">
                        {money(saldoFavorCliente, "USD")}
                        {tasaCobro ? (
                          <span className="text-emerald-600">
                            {" · "}
                            {money(saldoFavorCliente * tasaCobro, "VES")}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ) : null}

                  {/* Acción destacada: dejar el resto a fiado (un toque). Aparece cuando
                falta cubrir, no hay fila fiado aún y hay espacio para agregarla. */}
                  {!tieneFiado && calcPagos.faltante > 0.02 && pagos.length < 4 ? (
                    clienteSeleccionado ? (
                      <button
                        type="button"
                        onClick={dejarRestoFiado}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2.5 text-left transition-colors hover:bg-orange-100"
                      >
                        <span className="flex items-center gap-2">
                          <CreditCard className="size-4 shrink-0 text-orange-600" aria-hidden />
                          <span className="text-sm font-medium text-orange-800">
                            Dejar el resto a fiado
                          </span>
                        </span>
                        <span className="text-right text-sm font-semibold tabular-nums text-orange-700">
                          {money(calcPagos.faltante, "USD")}
                          {tasaCobro ? (
                            <span className="text-orange-600">
                              {" · "}
                              {money(calcPagos.faltante * tasaCobro, "VES")}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    ) : (
                      <p className="rounded-lg border border-dashed border-orange-300 bg-orange-50/50 px-3 py-2 text-xs text-orange-700">
                        Faltan {money(calcPagos.faltante, "USD")}
                        {tasaCobro ? ` · ${money(calcPagos.faltante * tasaCobro, "VES")}` : ""}.
                        Selecciona un cliente abajo para dejar el resto a fiado.
                      </p>
                    )
                  ) : null}

                  {tieneFiado && calcPagos.fiadoMonto <= 0.001 ? (
                    <p className="text-warning text-xs">
                      Los otros pagos ya cubren el total, así que no queda nada por fiar. Reduce un
                      pago o quita la forma de pago &quot;Fiado&quot;.
                    </p>
                  ) : null}

                  {tieneFiado &&
                  clienteSeleccionado &&
                  calcPagos.fiadoMonto > 0 &&
                  calcPagos.fiadoMonto > disponibleFiado ? (
                    <p className="text-warning text-xs">
                      El monto a fiar (${calcPagos.fiadoMonto.toFixed(2)}) supera el crédito
                      disponible ($
                      {disponibleFiado.toFixed(2)}).
                    </p>
                  ) : null}
                </div>

                {/* Cliente — siempre visible en el diálogo; obligatorio si hay fiado */}
                <div className="space-y-1.5">
                  <Label
                    className={tieneFiado && !clienteSeleccionado ? "text-orange-600" : undefined}
                  >
                    {tieneFiado ? "Cliente (obligatorio para fiar)" : "Cliente (opcional)"}
                  </Label>
                  {clienteSeleccionado ? (
                    <div
                      className={`border-border bg-surface-2 flex items-center justify-between rounded-md border px-3 py-2 ${tieneFiado ? "border-orange-300" : ""}`}
                    >
                      <div className="flex items-center gap-2">
                        <UserCheck className="text-accent-600 size-4 shrink-0" />
                        <div>
                          <p className="text-heading text-sm font-medium">
                            {clienteSeleccionado.nombre}
                          </p>
                          {clienteSeleccionado.limite_fiado_usd > 0 ? (
                            <p className="text-muted-foreground text-xs tabular-nums">
                              Disponible a fiado: ${disponibleFiado.toFixed(2)}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setClienteId("");
                          setPagos((prev) =>
                            prev.map((p) =>
                              p.metodo === "fiado"
                                ? trasladarSaldoDesdeFiado(p, metodoPorDefecto, prev)
                                : p,
                            ),
                          );
                        }}
                        aria-label="Quitar cliente"
                        className="text-muted-foreground hover:text-heading"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <div ref={dialogClienteRef} className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          setDialogClienteDropdown((v) => !v);
                          setDialogClienteQuery("");
                        }}
                        className={`border-border bg-background text-muted-foreground focus-visible:ring-ring flex h-10 w-full items-center justify-between rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 ${tieneFiado ? "border-orange-400" : ""}`}
                      >
                        <span>
                          {tieneFiado ? "Seleccionar cliente (obligatorio)" : "Buscar cliente…"}
                        </span>
                        <ChevronDown className="size-4 shrink-0" aria-hidden />
                      </button>
                      {dialogClienteDropdown ? (
                        <div className="border-border bg-surface absolute z-50 mt-1 w-full rounded-md border shadow-lg">
                          <div className="p-2">
                            <Input
                              value={dialogClienteQuery}
                              onChange={(e) => setDialogClienteQuery(e.target.value)}
                              placeholder="Nombre o cédula…"
                              className="h-8 text-sm"
                            />
                          </div>
                          <ul className="max-h-48 overflow-y-auto pb-1">
                            {dialogClientesFiltrados.length === 0 ? (
                              <li className="text-muted-foreground px-3 py-2 text-sm">
                                Sin resultados.
                              </li>
                            ) : (
                              dialogClientesFiltrados.map((c) => {
                                const disp = Math.max(0, c.limite_fiado_usd - c.saldo_usd);
                                return (
                                  <li key={c.id}>
                                    <button
                                      type="button"
                                      className="hover:bg-surface-2 flex w-full items-start gap-2 px-3 py-2 text-left"
                                      onClick={() => {
                                        setClienteId(c.id);
                                        setDialogClienteDropdown(false);
                                        setDialogClienteQuery("");
                                        setError(null);
                                      }}
                                    >
                                      <div className="min-w-0 flex-1">
                                        <p className="text-heading text-sm font-medium">
                                          {c.nombre}
                                        </p>
                                        {c.cedula ? (
                                          <p className="text-muted-foreground text-xs">
                                            CI {c.cedula}
                                          </p>
                                        ) : null}
                                      </div>
                                      {c.limite_fiado_usd > 0 ? (
                                        <span className="text-muted-foreground mt-0.5 shrink-0 text-xs tabular-nums">
                                          fiado: ${disp.toFixed(2)} disp.
                                        </span>
                                      ) : null}
                                    </button>
                                  </li>
                                );
                              })
                            )}
                          </ul>
                          <div className="border-border border-t p-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setDialogClienteDropdown(false);
                                setCrearClienteOpen(true);
                              }}
                              className="text-accent-600 hover:bg-accent-50 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm font-medium"
                            >
                              <PlusCircle className="size-4 shrink-0" aria-hidden />
                              Crear cliente nuevo
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>

              {/* Resumen — en escritorio ancho, columna derecha junto a las formas de pago. */}
              <div className="min-w-0">
                <div className="border-border space-y-1.5 rounded-lg border p-3 text-sm">
                  {ivaPct > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5 pb-1">
                      <span className="text-muted-foreground text-xs">
                        Impuestos de esta venta:
                      </span>
                      <button
                        type="button"
                        onClick={() => setIvaOn((v) => !v)}
                        aria-pressed={ivaOn}
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${
                          ivaOn
                            ? "bg-accent-500 text-white"
                            : "border-border text-muted-foreground border"
                        }`}
                      >
                        IVA {ivaPct}% {ivaOn ? "activo" : "inactivo"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIgtfOn((v) => !v)}
                        aria-pressed={igtfOn}
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${
                          igtfOn
                            ? "bg-accent-500 text-white"
                            : "border-border text-muted-foreground border"
                        }`}
                      >
                        IGTF {igtfOn ? "activo" : "inactivo"}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5 pb-1">
                      <span className="text-muted-foreground text-xs">IGTF de esta venta:</span>
                      <button
                        type="button"
                        onClick={() => setIgtfOn((v) => !v)}
                        aria-pressed={igtfOn}
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${
                          igtfOn
                            ? "bg-accent-500 text-white"
                            : "border-border text-muted-foreground border"
                        }`}
                      >
                        IGTF {igtfOn ? "activo" : "inactivo"}
                      </button>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal bruto</span>
                    <span className="tabular-nums">{money(subtotalBruto, "USD")}</span>
                  </div>
                  {descuentoUsd > 0 ? (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Descuento</span>
                      <span className="text-success tabular-nums">
                        −{money(descuentoUsd, "USD")}
                      </span>
                    </div>
                  ) : null}
                  {calcPagos.ivaUsd > 0 ? (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        IVA ({ivaPct} %){hayLineaExenta ? " — solo sobre lo gravado" : ""}
                      </span>
                      <span className="tabular-nums">{money(calcPagos.ivaUsd, "USD")}</span>
                    </div>
                  ) : null}
                  {calcPagos.igtf > 0 ? (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">IGTF (3 %)</span>
                      <span className="tabular-nums">{money(calcPagos.igtf, "USD")}</span>
                    </div>
                  ) : null}
                  <div className="border-border flex items-start justify-between border-t pt-1.5 font-medium">
                    <span>Total</span>
                    <div className="text-right">
                      <p className="text-heading tabular-nums">
                        {money(calcPagos.totalUsd, "USD")}
                      </p>
                      {tasaCobro ? (
                        <p className="text-muted-foreground text-xs font-normal tabular-nums">
                          {money(calcPagos.totalBs, "VES")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {tieneFiado && calcPagos.fiadoMonto > 0 ? (
                    <div className="flex items-start justify-between text-xs">
                      <span className="text-muted-foreground">Queda a deber (fiado)</span>
                      <div className="text-right">
                        <p className="font-medium tabular-nums text-orange-600">
                          {money(calcPagos.fiadoMonto, "USD")}
                        </p>
                        {tasaCobro ? (
                          <p className="text-muted-foreground tabular-nums">
                            {money(calcPagos.fiadoMonto * tasaCobro, "VES")}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  <div className="border-border flex items-start justify-between border-t pt-1.5 text-xs">
                    <span className="text-muted-foreground">Cubierto</span>
                    <div className="text-right">
                      <p className="tabular-nums">{money(calcPagos.cubierto, "USD")}</p>
                      {tasaCobro && calcPagos.cubierto > 0.001 ? (
                        <p className="text-muted-foreground tabular-nums">
                          {money(calcPagos.cubierto * tasaCobro, "VES")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {calcPagos.vuelto > 0.005 ? (
                    <div className="space-y-2 rounded-md bg-green-50 p-2">
                      <div className="flex items-start justify-between text-xs">
                        <span className="text-muted-foreground">Excedente (pagó de más)</span>
                        <div className="text-right">
                          <p className="text-success font-medium tabular-nums">
                            {money(calcPagos.vuelto, "USD")}
                          </p>
                          {tasaCobro ? (
                            <p className="text-muted-foreground tabular-nums">
                              {money(excedenteBs, "VES")}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <p className="text-muted-foreground text-xs">
                        ¿Qué hacemos con el excedente?
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {!offline ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                disabled={!clienteSeleccionado}
                                onClick={() => {
                                  setVueltoAcreditar(true);
                                  setVueltoCuentaId(null);
                                }}
                                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                  vueltoAcreditar
                                    ? "border-emerald-600 bg-emerald-600 text-white"
                                    : "border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100"
                                }`}
                              >
                                Acreditar
                                {clienteSeleccionado ? ` a ${clienteSeleccionado.nombre}` : ""}
                              </button>
                            </TooltipTrigger>
                            {!clienteSeleccionado ? (
                              <TooltipContent>
                                Selecciona un cliente para poder acreditarle el excedente
                              </TooltipContent>
                            ) : null}
                          </Tooltip>
                        ) : null}
                        <div className="flex overflow-hidden rounded-md border border-green-300">
                          <button
                            type="button"
                            onClick={() => {
                              setVueltoMoneda("VES");
                              setVueltoCuentaId(null);
                              setVueltoAcreditar(false);
                            }}
                            className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                              !vueltoCuentaId && !vueltoAcreditar && vueltoMoneda === "VES"
                                ? "bg-success text-white"
                                : "bg-white text-green-700 hover:bg-green-100"
                            }`}
                          >
                            Efectivo Bs
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setVueltoMoneda("USD");
                              setVueltoCuentaId(null);
                              setVueltoAcreditar(false);
                            }}
                            className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                              !vueltoCuentaId && !vueltoAcreditar && vueltoMoneda === "USD"
                                ? "bg-success text-white"
                                : "bg-white text-green-700 hover:bg-green-100"
                            }`}
                          >
                            Efectivo USD
                          </button>
                        </div>
                        {!offline
                          ? cuentasVueltoDigital.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  setVueltoCuentaId(c.id);
                                  setVueltoAcreditar(false);
                                }}
                                title={`${c.banco} — ${c.titular}`}
                                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                                  vueltoCuentaId === c.id
                                    ? "border-success bg-success text-white"
                                    : "border-green-300 bg-white text-green-700 hover:bg-green-100"
                                }`}
                              >
                                {METODO_CUENTA_LABEL[c.metodo as keyof typeof METODO_CUENTA_LABEL]}{" "}
                                · {c.banco}
                              </button>
                            ))
                          : null}
                      </div>
                      {vueltoAcreditar ? (
                        <p className="text-muted-foreground text-xs">
                          Quedará como saldo a favor de {clienteSeleccionado?.nombre} para su
                          próxima compra.
                        </p>
                      ) : vueltoCuentaId ? (
                        <p className="text-muted-foreground text-xs">
                          Ese monto saldrá de esa cuenta, no de la caja en efectivo.
                        </p>
                      ) : null}
                    </div>
                  ) : calcPagos.faltante > 0.02 ? (
                    <div className="flex items-start justify-between text-xs">
                      <span className="text-muted-foreground">Falta cubrir</span>
                      <div className="text-right">
                        <p className="text-warning font-medium tabular-nums">
                          {money(calcPagos.faltante, "USD")}
                        </p>
                        {tasaCobro ? (
                          <p className="text-muted-foreground tabular-nums">
                            {money(calcPagos.faltante * tasaCobro, "VES")}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <p className="text-success text-xs font-medium">✓ Total cubierto</p>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDejarEnEsperaOpen(true)}
                disabled={pending || lineas.length === 0}
                className="sm:mr-auto"
              >
                <Clock3 className="mr-1.5 size-4" aria-hidden />
                Dejar en espera
              </Button>
              <Button
                variant="outline"
                onClick={() => void cerrarCobroSinConfirmar()}
                disabled={pending}
              >
                Cerrar
              </Button>
              <Button onClick={confirmarVenta} disabled={pending || !calcPagos.puedeConfirmar}>
                {pending ? "Procesando…" : "✓ Confirmar venta"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Modal de peso para productos a granel ── */}
        <Dialog
          open={granelProducto !== null}
          onOpenChange={(v) => {
            if (!v) {
              setGranelProducto(null);
              setGranelReemplaza(false);
            }
          }}
        >
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle>Cantidad — {granelProducto?.nombre}</DialogTitle>
              <DialogDescription>
                Ingresa el peso o volumen vendido ({granelProducto?.unidad ?? "kg"}).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <Label htmlFor="granel-cantidad">Cantidad ({granelProducto?.unidad ?? "kg"})</Label>
              <Input
                id="granel-cantidad"
                type="number"
                inputMode="decimal"
                step="0.001"
                min="0.001"
                value={granelCantidad}
                onChange={(e) => setGranelCantidad(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmarGranel();
                }}
                placeholder="0.500"
              />
              {granelProducto ? (
                <p className="text-muted-foreground text-xs">
                  Precio: {money(Number(granelProducto.precio_usd), "USD")} /{" "}
                  {granelProducto.unidad}
                  {(() => {
                    const cant = parseFloat(granelCantidad.replace(",", "."));
                    if (!Number.isFinite(cant) || cant <= 0) return null;
                    const totalUsd = cant * Number(granelProducto.precio_usd);
                    return (
                      <>
                        {" "}
                        · Total:{" "}
                        <span className="text-heading font-medium">
                          {money(totalUsd, "USD")}
                          {tasa ? ` (${money(totalUsd * tasa, "VES")})` : ""}
                        </span>
                      </>
                    );
                  })()}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setGranelProducto(null);
                  setGranelReemplaza(false);
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={confirmarGranel}
                disabled={
                  !Number.isFinite(parseFloat(granelCantidad.replace(",", "."))) ||
                  parseFloat(granelCantidad.replace(",", ".")) <= 0
                }
              >
                {granelReemplaza ? "Actualizar cantidad" : "Agregar al carrito"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Modal de ajuste de precio (puntual para esta venta, no toca el catálogo) ── */}
        <Dialog
          open={precioEditandoId !== null}
          onOpenChange={(v) => {
            if (!v) cerrarEditarPrecio();
          }}
        >
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle>Ajustar precio — {lineaEditandoPrecio?.producto.nombre}</DialogTitle>
              <DialogDescription>
                Precio solo para esta venta. No cambia el precio del producto en Inventario.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {lineaEditandoPrecio ? (
                <p className="text-muted-foreground text-xs">
                  Precio normal: {money(Number(lineaEditandoPrecio.producto.precio_usd), "USD")}
                  {tasa
                    ? ` (${money(Number(lineaEditandoPrecio.producto.precio_usd) * tasa, "VES")})`
                    : ""}
                </p>
              ) : null}

              <div className="border-border flex w-fit overflow-hidden rounded-md border">
                <button
                  type="button"
                  onClick={() => setPrecioNuevoMoneda("USD")}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    precioNuevoMoneda === "USD"
                      ? "bg-accent-500 text-white"
                      : "bg-background text-muted-foreground hover:bg-surface-2"
                  }`}
                >
                  USD
                </button>
                <button
                  type="button"
                  onClick={() => setPrecioNuevoMoneda("VES")}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    precioNuevoMoneda === "VES"
                      ? "bg-accent-500 text-white"
                      : "bg-background text-muted-foreground hover:bg-surface-2"
                  }`}
                >
                  Bs
                </button>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="precio-nuevo">
                  Nuevo precio unitario ({precioNuevoMoneda === "USD" ? "USD" : "Bs"})
                </Label>
                <Input
                  id="precio-nuevo"
                  type="text"
                  inputMode="decimal"
                  value={precioNuevoInput}
                  onChange={(e) => setPrecioNuevoInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") aplicarPrecioAjustado();
                  }}
                  placeholder="0.00"
                />
              </div>

              {(() => {
                const num = parseFloat(precioNuevoInput.replace(",", "."));
                if (!Number.isFinite(num) || num <= 0) return null;
                const tasaConv = tasaCobro ?? tasa ?? 0;
                const precioUsd =
                  precioNuevoMoneda === "USD" ? num : tasaConv > 0 ? num / tasaConv : num;
                return (
                  <p className="text-muted-foreground text-xs">
                    Equivale a {money(precioUsd, "USD")}
                    {tasaConv > 0 ? ` (${money(precioUsd * tasaConv, "VES")})` : ""} por unidad.
                  </p>
                );
              })()}

              <div className="space-y-1.5">
                <Label htmlFor="motivo-ajuste">Motivo (opcional)</Label>
                <Input
                  id="motivo-ajuste"
                  value={motivoAjusteInput}
                  onChange={(e) => setMotivoAjusteInput(e.target.value)}
                  placeholder="ej. producto dañado, precio negociado"
                  maxLength={200}
                />
              </div>
            </div>
            <DialogFooter className="flex-wrap gap-2 sm:justify-between">
              {lineaEditandoPrecio?.precioAjustadoUsd !== undefined ? (
                <Button
                  type="button"
                  variant="outline"
                  className="text-danger"
                  onClick={() => precioEditandoId && quitarAjustePrecio(precioEditandoId)}
                >
                  Quitar ajuste
                </Button>
              ) : null}
              <div className="ml-auto flex gap-2">
                <Button type="button" variant="outline" onClick={cerrarEditarPrecio}>
                  Cancelar
                </Button>
                <Button
                  onClick={aplicarPrecioAjustado}
                  disabled={
                    !Number.isFinite(parseFloat(precioNuevoInput.replace(",", "."))) ||
                    parseFloat(precioNuevoInput.replace(",", ".")) <= 0
                  }
                >
                  Aplicar
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Venta guardada sin conexión: no hay servidor para mostrar el recibo, así
            que se confirma en el mismo POS con los datos que ya tenemos en mano. */}
        <Dialog open={ventaOffline !== null} onOpenChange={(o) => !o && setVentaOffline(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <WifiOff className="size-5 text-amber-600" aria-hidden />
                Venta guardada sin conexión
              </DialogTitle>
              <DialogDescription>
                Se guardó en este dispositivo y se subirá sola cuando vuelva la conexión a internet.
                No se pierde nada.
              </DialogDescription>
            </DialogHeader>
            {ventaOffline ? (
              <div className="bg-surface-2 space-y-1.5 rounded-lg p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Folio local</span>
                  <span className="font-medium tabular-nums">{ventaOffline.numeroDocumento}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-semibold tabular-nums">
                    {money(ventaOffline.totalUsd, "USD")} · {money(ventaOffline.totalBs, "VES")}
                  </span>
                </div>
              </div>
            ) : null}
            <DialogFooter>
              <Button onClick={() => setVentaOffline(null)}>Nueva venta</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <CrearClienteModal
          open={crearClienteOpen}
          onOpenChange={setCrearClienteOpen}
          offline={offline}
          powerSyncDb={powerSyncDb}
          tenantId={tenantId}
          onCreado={onClienteCreado}
        />

        <CalculadoraModal
          open={calculadoraOpen}
          onOpenChange={setCalculadoraOpen}
          tasaDelDia={tasa}
        />

        <DialogoDejarEnEspera
          open={dejarEnEsperaOpen}
          onOpenChange={setDejarEnEsperaOpen}
          onConfirmar={(nota) => void confirmarDejarEnEspera(nota)}
          cantidadArticulos={lineas.reduce((s, l) => s + l.cantidad, 0)}
          guardando={guardandoEnEspera}
        />
      </div>

      {/* Barra flotante de cobro — móvil: acceso al total/Cobrar sin bajar hasta el carrito */}
      {lineas.length > 0 ? (
        <div
          className="border-border bg-surface fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t px-4 pt-3 shadow-lg lg:hidden"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-xs">
              {lineas.reduce((s, l) => s + l.cantidad, 0)} artículo(s)
            </p>
            <p className="text-heading font-display text-lg font-bold tabular-nums">
              {money(subtotalNeto, "USD")}
            </p>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={() => setDejarEnEsperaOpen(true)}
            aria-label="Dejar venta en espera"
            title="Dejar venta en espera"
          >
            <Clock3 className="size-4" aria-hidden />
          </Button>
          <Button size="lg" disabled={!tasa} onClick={abrirCobro} className="shrink-0">
            Cobrar
          </Button>
        </div>
      ) : null}
    </div>
  );
}
