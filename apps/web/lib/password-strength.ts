/** Evaluación simple de fuerza de contraseña — sin dependencias externas. */

export type NivelFuerza = "vacia" | "debil" | "media" | "fuerte";

export interface ResultadoFuerza {
  puntaje: number;
  nivel: NivelFuerza;
  etiqueta: string;
  /** 0-100, para el ancho de la barra del medidor. */
  porcentaje: number;
  sugerencias: string[];
}

/** Fuerza por longitud, mayúsculas/minúsculas combinadas, números y símbolos. */
export function evaluarFuerzaPassword(password: string): ResultadoFuerza {
  if (!password) {
    return { puntaje: 0, nivel: "vacia", etiqueta: "", porcentaje: 0, sugerencias: [] };
  }

  const largo = password.length;
  const tieneMinuscula = /[a-z]/.test(password);
  const tieneMayuscula = /[A-Z]/.test(password);
  const tieneNumero = /[0-9]/.test(password);
  const tieneSimbolo = /[^a-zA-Z0-9]/.test(password);

  let puntaje = 0;
  if (largo >= 8) puntaje++;
  if (largo >= 12) puntaje++;
  if (tieneMinuscula && tieneMayuscula) puntaje++;
  if (tieneNumero) puntaje++;
  if (tieneSimbolo) puntaje++;

  const sugerencias: string[] = [];
  if (largo < 8) sugerencias.push("Usa al menos 8 caracteres");
  if (!(tieneMinuscula && tieneMayuscula)) sugerencias.push("Combina mayúsculas y minúsculas");
  if (!tieneNumero) sugerencias.push("Agrega números");
  if (!tieneSimbolo) sugerencias.push("Agrega símbolos (ej. !@#$)");

  let nivel: NivelFuerza;
  let etiqueta: string;
  if (puntaje <= 1) {
    nivel = "debil";
    etiqueta = "Débil";
  } else if (puntaje <= 3) {
    nivel = "media";
    etiqueta = "Media";
  } else {
    nivel = "fuerte";
    etiqueta = "Fuerte";
  }

  return {
    puntaje,
    nivel,
    etiqueta,
    porcentaje: Math.min(100, Math.round((puntaje / 5) * 100)),
    sugerencias: sugerencias.slice(0, 2),
  };
}
