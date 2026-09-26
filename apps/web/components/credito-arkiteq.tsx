"use client";

import { usePathname } from "next/navigation";
import { cn } from "@arkiteq/ui";

export const CREDITO_URL = "https://kiteq-data.netlify.app";

/**
 * Crédito de autoría ("Diseñado y creado por Arkiteq Data"). Nunca se
 * imprime (recibos, tickets y reportes quedan limpios).
 * `tono="oscuro"` para colocarlo sobre fondos fotográficos/oscuros.
 */
export function CreditoArkiteq({
  className,
  tono = "normal",
}: {
  className?: string;
  tono?: "normal" | "oscuro";
}) {
  return (
    <footer
      className={cn(
        "px-5 py-4 text-center text-xs print:hidden",
        tono === "oscuro" ? "text-white/60" : "text-muted-foreground",
        className,
      )}
    >
      Diseñado y creado por{" "}
      <a
        href={CREDITO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "font-semibold underline-offset-4 transition hover:underline",
          tono === "oscuro" ? "text-white/90 hover:text-white" : "text-foreground",
        )}
      >
        Arkiteq Data
      </a>
    </footer>
  );
}

/**
 * Pie global (root layout). Las rutas con fondo a pantalla completa o shell
 * propio (portada, login/registro, vertical Minimarket) lo renderizan ellas
 * mismas dentro de su composición para que quede integrado y visible.
 */
const RUTAS_CON_PIE_PROPIO = ["/login", "/registro", "/minimarket"];

export function PieGlobal() {
  const pathname = usePathname() ?? "";
  if (pathname === "/") return null;
  if (RUTAS_CON_PIE_PROPIO.some((r) => pathname === r || pathname.startsWith(`${r}/`))) {
    return null;
  }
  return <CreditoArkiteq className="border-border border-t" />;
}
