"use client";

import { evaluarFuerzaPassword, type NivelFuerza } from "@/lib/password-strength";

const COLOR_BARRA: Record<NivelFuerza, string> = {
  vacia: "bg-transparent",
  debil: "bg-danger",
  media: "bg-warning",
  fuerte: "bg-success",
};

const COLOR_TEXTO: Record<NivelFuerza, string> = {
  vacia: "",
  debil: "text-danger",
  media: "text-warning",
  fuerte: "text-success",
};

/** Medidor de fuerza en vivo: barra animada + etiqueta + sugerencias si es débil. */
export function PasswordStrengthMeter({ password }: { password: string }) {
  const resultado = evaluarFuerzaPassword(password);
  if (resultado.nivel === "vacia") return null;

  return (
    <div className="space-y-1.5" aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="bg-surface-2 h-1.5 flex-1 overflow-hidden rounded-full">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none ${COLOR_BARRA[resultado.nivel]}`}
            style={{ width: `${resultado.porcentaje}%` }}
          />
        </div>
        <span className={`text-xs font-semibold ${COLOR_TEXTO[resultado.nivel]}`}>
          {resultado.etiqueta}
        </span>
      </div>
      {resultado.sugerencias.length > 0 ? (
        <p className="text-muted-foreground text-xs">{resultado.sugerencias.join(" · ")}</p>
      ) : null}
    </div>
  );
}
