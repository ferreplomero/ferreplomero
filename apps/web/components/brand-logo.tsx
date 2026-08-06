import Image from "next/image";
import { cn } from "@arkiteq/ui";

export interface BrandLogoProps {
  /** Alto en clases Tailwind; el ancho se ajusta solo (relación ~2.24:1). */
  className?: string;
  /** Marca la imagen como prioritaria (logo sobre el pliegue, p. ej. cabeceras). */
  priority?: boolean;
}

/**
 * Logotipo de marca (lockup completo "Arkiteq Data") servido desde
 * `public/logo.png`. Dimensiones intrínsecas a la relación real del activo
 * (2418×1080) para evitar saltos de layout; el tamaño visible se controla
 * con `className` (alto fijo, ancho automático).
 *
 * El wordmark del PNG es mayormente blanco sobre fondo transparente (pensado
 * para superficies oscuras). Se envuelve en una placa `bg-ink-900` fija para
 * que mantenga contraste siempre, sin importar el tema claro/oscuro de la
 * superficie donde se use (sidebar, header, footer).
 */
export function BrandLogo({ className, priority = false }: BrandLogoProps) {
  return (
    <span className="bg-ink-900 inline-flex items-center rounded-md px-2 py-1.5">
      <Image
        src="/logo.png"
        alt="Arkiteq Data"
        width={224}
        height={100}
        priority={priority}
        className={cn("h-8 w-auto", className)}
      />
    </span>
  );
}
