/**
 * Guion del tour de bienvenida de Arki. `href` es la ruta a la que el tour
 * navega automáticamente al llegar a ese paso (el usuario no abre nada
 * manualmente); `tourId` referencia el `data-tour="nav-<tourId>"` del módulo
 * a resaltar en el menú (ver `lib/minimarket/nav.ts` y `vertical-shell.tsx`).
 * Ambos `undefined` = tarjeta centrada, sin navegar ni resaltar nada
 * (bienvenida y cierre). Textos de 2-4 frases: qué es, para qué sirve y algo
 * útil de cómo se usa — en primera persona, tono venezolano cálido.
 */
export interface ArkiTourStep {
  id: string;
  href?: string;
  tourId?: string;
  titulo: string;
  texto: string;
}

const BASE = "/minimarket";

export const ARKI_TOUR_STEPS: ArkiTourStep[] = [
  {
    id: "bienvenida",
    titulo: "¡Hola! Soy Arki",
    texto:
      "Voy a mostrarte lo básico de tu Minimarket en un minutico, para que empieces a vender hoy mismo. Te llevo paso a paso por cada sección — solo sígueme.",
  },
  {
    id: "ventas",
    href: `${BASE}/ventas`,
    tourId: "ventas",
    titulo: "Ventas",
    texto:
      "Aquí es donde registras cada venta de tu negocio. Puedes cobrar en efectivo, pago móvil, Zelle o dejar fiado, e incluso combinar varios métodos en una misma venta. El sistema te calcula el total en bolívares y dólares al instante, con la tasa del día ya aplicada.",
  },
  {
    id: "inventario",
    href: `${BASE}/inventario`,
    tourId: "inventario",
    titulo: "Inventario",
    texto:
      "Aquí llevas el control de tus productos: precios, existencias y categorías. Registras productos por unidad o por peso (a granel), y el sistema te avisa cuando algo se está agotando. Así nunca te quedas sin tu producto estrella.",
  },
  {
    id: "caja",
    href: `${BASE}/caja`,
    tourId: "caja",
    titulo: "Caja",
    texto:
      "Aquí abres tu turno al empezar el día y lo cierras al terminar. El sistema calcula solo cuánto debería haber en efectivo y en cada método de pago, y tú nada más confirmas que cuadre. Sabes al céntimo cómo te fue hoy.",
  },
  {
    id: "clientes",
    href: `${BASE}/clientes`,
    tourId: "clientes",
    titulo: "Clientes y Fiado",
    texto:
      "Aquí llevas el control de quién te debe y cuánto. Le pones un límite de crédito a cada cliente, registras sus abonos y ves su historial completo. Se acabó el cuaderno de fiado con las cuentas borrosas.",
  },
  {
    id: "tasa",
    href: `${BASE}/tasa`,
    tourId: "tasa",
    titulo: "Tasa de cambio",
    texto:
      "Aquí ves la tasa del día — la del BCV o la que tú prefieras usar. La puedes ajustar manualmente cuando quieras, y tu ajuste siempre tiene la última palabra. Todos tus precios y ventas se calculan con esta tasa automáticamente.",
  },
  {
    id: "reportes",
    href: `${BASE}/reportes`,
    tourId: "reportes",
    titulo: "Reportes",
    texto:
      "Aquí ves cómo va tu negocio de verdad: cuánto vendiste, cuánto ganaste y qué se te vende más. Revisas por día, semana o mes, y hasta exportas todo para tu contador. Ya no manejas tu negocio a ciegas.",
  },
  {
    id: "cierre",
    titulo: "¡Listo, eso es todo!",
    texto:
      "Ya conoces lo básico de tu Minimarket — el resto lo vas descubriendo sobre la marcha. Cualquier duda, aquí estaré cuando me necesites. ¡Mucho éxito con tu negocio!",
  },
];
