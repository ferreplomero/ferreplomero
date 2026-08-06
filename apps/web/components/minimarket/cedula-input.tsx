"use client";

import * as React from "react";
import { Input } from "@arkiteq/ui";

const PREFIJOS_CEDULA = ["V", "E", "J", "G"] as const;

const SELECT_CLASS =
  "border-border bg-background focus-visible:ring-ring h-10 shrink-0 rounded-md rounded-r-none border border-r-0 px-2 text-sm focus-visible:outline-none focus-visible:ring-2";

function partir(valor: string): { prefijo: string; numero: string } {
  const m = valor.trim().match(/^([VEJGvejg])[- ]?(\d*)$/);
  if (m?.[1]) return { prefijo: m[1].toUpperCase(), numero: m[2] ?? "" };
  return { prefijo: "V", numero: valor.replace(/\D/g, "") };
}

/**
 * Cédula venezolana: selector de prefijo (V/E/J/G, "V" por defecto) + número.
 * Emite el valor combinado sin separador ("V12345678") — el formato que
 * espera la validación del servidor. El número solo acepta dígitos, así el
 * usuario nunca puede escribir un valor con formato inválido.
 *
 * El `<select>` de prefijo y el `<input>` de número son dos controles del
 * DOM separados, pero un formulario nativo (`new FormData(form)`) solo
 * envía por su atributo `name` — si ambos (o ninguno) llevan `name`, el
 * servidor recibía solo los dígitos sin la letra y rechazaba una cédula bien
 * escrita como "formato inválido". Por eso el valor combinado va en un
 * `<input type="hidden">` con `name`, que es el único control que participa
 * en el envío; el select y el input visibles quedan sin `name`, son solo UI.
 */
export function CedulaInput({
  id,
  name,
  value,
  onChange,
  placeholder = "12345678",
}: {
  id: string;
  name: string;
  value: string;
  onChange: (combinado: string) => void;
  placeholder?: string;
}) {
  const { prefijo, numero } = React.useMemo(() => partir(value), [value]);

  function emitir(nuevoPrefijo: string, nuevoNumero: string) {
    onChange(nuevoNumero ? `${nuevoPrefijo}${nuevoNumero}` : "");
  }

  return (
    <div className="flex">
      <select
        aria-label="Tipo de documento"
        className={SELECT_CLASS}
        value={prefijo}
        onChange={(e) => emitir(e.target.value, numero)}
      >
        {PREFIJOS_CEDULA.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <Input
        id={id}
        inputMode="numeric"
        value={numero}
        onChange={(e) => emitir(prefijo, e.target.value.replace(/\D/g, "").slice(0, 9))}
        placeholder={placeholder}
        className="rounded-l-none"
      />
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
