import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  Building2,
  CreditCard,
  FileSpreadsheet,
  HandCoins,
  Home,
  Landmark,
  RefreshCw,
  Settings,
  ShoppingBag,
  Truck,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { METODO_CUENTA_LABEL, METODOS_CON_CUENTA, RUTA_TIPO_CUENTA } from "./bancos";

export const MINIMARKET_SLUG = "minimarket";
export const MINIMARKET_BASE = "/minimarket";

export interface VerticalNavSubItem {
  label: string;
  href: string;
}

export interface VerticalNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
  fase: number;
  children?: VerticalNavSubItem[];
  /** Id estable para el tour de bienvenida de Arki (`data-tour="nav-<tourId>"`). */
  tourId?: string;
}

export const MINIMARKET_NAV: VerticalNavItem[] = [
  {
    label: "Tablero",
    href: `${MINIMARKET_BASE}`,
    icon: Home,
    description: "Resumen del día: ventas, tasa, cartera por cobrar y accesos rápidos.",
    fase: 1,
  },
  {
    label: "Ventas",
    href: `${MINIMARKET_BASE}/ventas`,
    icon: ShoppingBag,
    description:
      "Registra ventas, cobra en múltiples métodos, consulta el historial completo y reimprime recibos del día.",
    fase: 3,
    tourId: "ventas",
    children: [
      { label: "Nueva venta", href: `${MINIMARKET_BASE}/ventas/nueva` },
      { label: "Historial", href: `${MINIMARKET_BASE}/ventas` },
      { label: "Recibos del día", href: `${MINIMARKET_BASE}/ventas/recibos` },
    ],
  },
  {
    label: "Inventario",
    href: `${MINIMARKET_BASE}/inventario`,
    icon: Boxes,
    description:
      "Productos, categorías y stock por sucursal. Movimientos append-only, alertas de stock mínimo, ajustes, mermas y carga masiva.",
    fase: 2,
    tourId: "inventario",
    children: [
      { label: "Productos", href: `${MINIMARKET_BASE}/inventario` },
      { label: "Categorías", href: `${MINIMARKET_BASE}/inventario/categorias` },
      { label: "Movimientos", href: `${MINIMARKET_BASE}/inventario/movimientos` },
      { label: "Ajustes / mermas", href: `${MINIMARKET_BASE}/inventario/ajustes` },
      { label: "Carga masiva", href: `${MINIMARKET_BASE}/inventario/carga` },
    ],
  },
  {
    label: "Compras",
    href: `${MINIMARKET_BASE}/compras`,
    icon: Truck,
    description:
      "Registra entradas de inventario con su costo. Al confirmar la recepción, el stock sube y el costo se actualiza.",
    fase: 6,
    children: [
      { label: "Lista de compras", href: `${MINIMARKET_BASE}/compras` },
      { label: "Nueva compra", href: `${MINIMARKET_BASE}/compras/nueva` },
      { label: "Cuentas por pagar", href: `${MINIMARKET_BASE}/compras/por-pagar` },
    ],
  },
  {
    label: "Proveedores",
    href: `${MINIMARKET_BASE}/proveedores`,
    icon: Truck,
    description:
      "Ficha de cada proveedor: contacto, WhatsApp, productos que surte, historial de compras y totales.",
    fase: 6,
    children: [
      { label: "Lista de proveedores", href: `${MINIMARKET_BASE}/proveedores` },
      { label: "Nuevo proveedor", href: `${MINIMARKET_BASE}/proveedores/nuevo` },
    ],
  },
  {
    label: "Clientes",
    href: `${MINIMARKET_BASE}/clientes`,
    icon: Users,
    description: "Ficha del cliente, historial de compras, estado de cuenta y límite de crédito.",
    fase: 5,
    tourId: "clientes",
    children: [
      { label: "Lista de clientes", href: `${MINIMARKET_BASE}/clientes` },
      { label: "Nuevo cliente", href: `${MINIMARKET_BASE}/clientes/nuevo` },
      { label: "Carga masiva de fiados", href: `${MINIMARKET_BASE}/clientes/carga` },
    ],
  },
  {
    label: "Fiado",
    href: `${MINIMARKET_BASE}/fiado`,
    icon: CreditCard,
    description:
      "Cuentas por cobrar: clientes con saldo abierto, morosos y cartera total. Los saldos son derivados del ledger, no editables.",
    fase: 5,
    children: [
      { label: "Cuentas abiertas", href: `${MINIMARKET_BASE}/fiado` },
      { label: "Morosos (+30 días)", href: `${MINIMARKET_BASE}/fiado/morosos` },
    ],
  },
  {
    label: "Presupuestos",
    href: `${MINIMARKET_BASE}/presupuestos`,
    icon: FileSpreadsheet,
    description:
      "Cotiza con precios editables, exporta en PDF/Excel y conviértelo en venta cuando el cliente acepte.",
    fase: 9,
    children: [
      { label: "Lista de presupuestos", href: `${MINIMARKET_BASE}/presupuestos` },
      { label: "Nuevo presupuesto", href: `${MINIMARKET_BASE}/presupuestos/nueva` },
    ],
  },
  {
    label: "Caja",
    href: `${MINIMARKET_BASE}/caja`,
    icon: Wallet,
    description:
      "Apertura y cierre de turno, arqueo, ingresos y egresos, cuadre con diferencias e historial de sesiones.",
    fase: 4,
    tourId: "caja",
  },
  {
    label: "Bancos",
    href: `${MINIMARKET_BASE}/bancos`,
    icon: Building2,
    description:
      "Cuentas bancarias del negocio para pago móvil, transferencia, Zelle, tarjeta y Cashea: saldo por cuenta (fijo en su moneda, nunca cambia con la tasa) e historial de ingresos y vueltos, aparte del efectivo de Caja.",
    fase: 4,
    children: METODOS_CON_CUENTA.map((metodo) => ({
      label: METODO_CUENTA_LABEL[metodo],
      href: `${MINIMARKET_BASE}/bancos/${RUTA_TIPO_CUENTA[metodo]}`,
    })),
  },
  {
    label: "Tasa de cambio",
    href: `${MINIMARKET_BASE}/tasa`,
    icon: ArrowLeftRight,
    description:
      "Tasa del día (automática o manual) con el override del comerciante que siempre prevalece, e historial de tasas.",
    fase: 1,
    tourId: "tasa",
    children: [
      { label: "Tasa actual", href: `${MINIMARKET_BASE}/tasa` },
      { label: "Historial", href: `${MINIMARKET_BASE}/tasa/historial` },
    ],
  },
  {
    label: "Reportes",
    href: `${MINIMARKET_BASE}/reportes`,
    icon: BarChart3,
    description:
      "Ventas por día, producto, categoría y sucursal; utilidad, más vendidos, cierre diario y cuentas por cobrar. Exportables.",
    fase: 7,
    tourId: "reportes",
    children: [
      { label: "Resumen general", href: `${MINIMARKET_BASE}/reportes` },
      { label: "Ganancias", href: `${MINIMARKET_BASE}/reportes/ganancias` },
      { label: "Gastos operativos", href: `${MINIMARKET_BASE}/reportes/gastos` },
      { label: "Otros ingresos", href: `${MINIMARKET_BASE}/reportes/otros-ingresos` },
    ],
  },
  {
    label: "Finanzas",
    href: `${MINIMARKET_BASE}/finanzas`,
    icon: Landmark,
    description:
      "Control interno: IVA registrado en ventas, IGTF cobrado, desglose por método de pago. Información de apoyo contable para entregar al contador.",
    fase: 7,
  },
  {
    label: "Deudas",
    href: `${MINIMARKET_BASE}/deudas`,
    icon: HandCoins,
    description:
      "Deudas del dueño/negocio (préstamos, servicios, alquiler, etc.) — distinto de las cuentas por pagar a proveedores. Solo lo ven dueño y administrador.",
    fase: 8,
    children: [
      { label: "Mis deudas", href: `${MINIMARKET_BASE}/deudas` },
      { label: "Registrar abono", href: `${MINIMARKET_BASE}/deudas/abonar` },
      { label: "Categorías", href: `${MINIMARKET_BASE}/deudas/categorias` },
      { label: "Resumen", href: `${MINIMARKET_BASE}/deudas/resumen` },
    ],
  },
  {
    label: "Personal",
    href: `${MINIMARKET_BASE}/personal`,
    icon: UserCog,
    description:
      "Registra a tu equipo con su propio acceso, asígnales un rol y crea roles personalizados con permisos a la medida. Solo lo ven dueño y administrador.",
    fase: 8,
    children: [
      { label: "Usuarios", href: `${MINIMARKET_BASE}/personal` },
      { label: "Roles", href: `${MINIMARKET_BASE}/personal/roles` },
    ],
  },
  {
    label: "Configuración",
    href: `${MINIMARKET_BASE}/configuracion`,
    icon: Settings,
    description: "Datos del negocio, sucursales, fuente de tasa, parámetros fiscales y respaldo.",
    fase: 8,
  },
  {
    label: "Sincronización",
    href: `${MINIMARKET_BASE}/sincronizacion`,
    icon: RefreshCw,
    description:
      "Estado de conexión, cola de cambios pendientes y sincronización forzada con el servidor.",
    fase: 1,
  },
];

export function getNavItem(href: string): VerticalNavItem | undefined {
  return MINIMARKET_NAV.find((item) => item.href === href);
}
