// Capa de país (moneda, impuestos, facturación intercambiables)
export * from "./country";

// Tipo de cambio (interfaz abstracta: fuentes, registro, resolución pura)
export * from "./exchange-rate";

// Entitlements (fuente de verdad del acceso)
export * from "./entitlements";

// Mensajería y notificaciones (contratos)
export type { WhatsAppMessage, WhatsAppProvider, WhatsAppSendResult } from "./messaging/whatsapp";
export type { Notification, NotificationChannel, Notifier } from "./notifications/notifier";

// Observabilidad (wrappers propios)
export * from "./observability";

// Validación (esquemas Zod en los límites)
export * from "./validation";
