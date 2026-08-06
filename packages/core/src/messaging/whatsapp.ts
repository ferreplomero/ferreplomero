/** Mensaje saliente de WhatsApp (plantilla o texto libre). */
export interface WhatsAppMessage {
  /** Teléfono destino en formato E.164 (p. ej. +584121234567). */
  to: string;
  /** Texto del mensaje, o nombre de plantilla si `templateParams` está presente. */
  body: string;
  templateName?: string;
  templateParams?: Record<string, string>;
}

export interface WhatsAppSendResult {
  id: string;
  status: "encolado" | "enviado" | "fallido";
}

/**
 * Contrato de envío por WhatsApp. La implementación concreta (Cloud API u otra)
 * se añade en el motor cuando el primer vertical la necesite.
 */
export interface WhatsAppProvider {
  readonly id: string;
  send(message: WhatsAppMessage): Promise<WhatsAppSendResult>;
}
