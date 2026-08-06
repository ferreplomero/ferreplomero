import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Une clases de Tailwind resolviendo conflictos (la última gana).
 * Uso: cn("px-2", condicion && "px-4") -> "px-4".
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
