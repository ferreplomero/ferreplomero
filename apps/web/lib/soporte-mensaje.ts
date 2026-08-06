export interface ContextoSoporte {
  nombre: string;
  correo: string;
  /** Nombre del negocio/tenant activo, si aplica. */
  negocio: string | null;
  /** Módulo/plan del usuario, ya resuelto a texto legible (ej. "Minimarket — Plan activo"). */
  modulo: string | null;
}

/**
 * Arma el mensaje prellenado de WhatsApp: la solicitud del cliente + los
 * datos de contexto disponibles, para que soporte no tenga que preguntar
 * quién escribe. Cada dato de contexto es opcional y se omite con gracia si
 * no está disponible (ej. un usuario sin negocio activo todavía).
 */
export function construirMensajeSoporte(
  { nombre, correo, negocio, modulo }: ContextoSoporte,
  solicitud: string,
): string {
  const partes: string[] = ["Hola, soporte de Arkiteq Data."];

  if (nombre) {
    partes.push(`Soy ${nombre}${negocio ? ` del negocio ${negocio}` : ""}.`);
  } else if (negocio) {
    partes.push(`Escribo por el negocio ${negocio}.`);
  }

  const datos: string[] = [];
  if (correo) datos.push(`correo ${correo}`);
  if (modulo) datos.push(modulo);
  if (datos.length > 0) partes.push(`(${datos.join(" · ")}).`);

  partes.push(`Mi solicitud: ${solicitud.trim()}`);

  return partes.join(" ");
}
