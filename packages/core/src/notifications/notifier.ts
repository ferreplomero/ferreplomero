export type NotificationChannel = "email" | "whatsapp" | "in_app";

export interface Notification {
  channel: NotificationChannel;
  /** Identificador del destinatario según el canal (email, teléfono, userId). */
  recipient: string;
  subject: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Contrato de notificaciones multicanal. El motor enruta cada notificación al
 * proveedor adecuado (correo, WhatsApp, in-app) detrás de esta interfaz.
 */
export interface Notifier {
  notify(notification: Notification): Promise<void>;
}
