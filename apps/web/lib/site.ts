/** Metadatos y navegación del sitio. Fuente única para enlaces y textos base. */

export const SITE = {
  name: "Arkiteq Data",
  description:
    "La plataforma donde tu negocio elige el software que necesita. Un solo registro, un catálogo de SaaS especializados para PYMES de Latinoamérica.",
  // Sin "/" final: varios lugares concatenan "SITE.url + /ruta" y una barra
  // final en la variable de entorno produce enlaces con doble barra
  // ("dominio//ruta") que WhatsApp y algunos navegadores rechazan como URL
  // inválida antes de pedirla al servidor.
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
  locale: "es",
  contactEmail: "arkiteqdata@gmail.com",
  // TODO: completar antes de lanzar — número de WhatsApp de contacto en formato
  // internacional sin "+" ni espacios (ej. "584121234567"). Mientras esté vacío,
  // los botones de contacto por WhatsApp (ej. prueba gratis vencida) se ocultan.
  contactWhatsapp: "",
} as const;

/** Rutas protegidas que exigen sesión iniciada. */
export const PROTECTED_PREFIXES = [
  "/inicio",
  "/catalogo",
  "/cuenta",
  "/equipo",
  "/modulo",
  "/minimarket",
  "/tecnico",
  "/condominio",
  "/portal-condominio",
  // Solo exige sesión aquí — la autorización real (solo arkiteqdata@gmail.com)
  // la hace requireSuperAdmin() en apps/web/lib/admin/auth.ts, en el servidor.
  "/admin",
  // Llega aquí con una sesión de recuperación ya activa (el callback de auth
  // la establece antes de redirigir) — exigir sesión es solo defensa extra.
  "/restablecer-clave",
] as const;

/** Rutas de autenticación (no accesibles con sesión activa). */
export const AUTH_ROUTES = ["/login", "/registro"] as const;

/** Ruta de aterrizaje tras iniciar sesión. */
export const APP_HOME = "/minimarket";

/** Cookie que recuerda el negocio (tenant) activo del usuario. */
export const ACTIVE_TENANT_COOKIE = "arkiteq_tenant";

export interface NavItem {
  label: string;
  href: string;
}

/** Navegación del sitio de marketing. */
export const MARKETING_NAV: NavItem[] = [
  { label: "Producto", href: "/#producto" },
  { label: "Cómo funciona", href: "/#como-funciona" },
  { label: "Catálogo", href: "/#catalogo" },
  { label: "Precios", href: "/#precios" },
  { label: "Preguntas", href: "/#preguntas" },
];
