"use client";

import * as React from "react";

/**
 * Teléfono y WhatsApp casi siempre son el mismo número en una bodega
 * venezolana. Mientras el usuario no toque el campo de WhatsApp a mano, cada
 * cambio en Teléfono se copia ahí en vivo. En cuanto edita WhatsApp
 * directamente, se respeta su valor y deja de copiarse — hasta que borre el
 * teléfono (entonces vuelve a seguirlo, útil si el usuario borra todo para
 * empezar de nuevo).
 */
export function useTelefonoWhatsapp(telefonoInicial = "", whatsappInicial = "") {
  const [telefono, setTelefonoState] = React.useState(telefonoInicial);
  const [whatsapp, setWhatsappState] = React.useState(whatsappInicial);
  const whatsappTocado = React.useRef(
    whatsappInicial.trim().length > 0 && whatsappInicial !== telefonoInicial,
  );

  function setTelefono(valor: string) {
    setTelefonoState(valor);
    if (!whatsappTocado.current) setWhatsappState(valor);
  }

  function setWhatsapp(valor: string) {
    whatsappTocado.current = true;
    setWhatsappState(valor);
  }

  /** Reinicia ambos campos y "olvida" que WhatsApp se había editado a mano (para reusar el formulario, ej. un modal que no se desmonta). */
  function reset(nuevoTelefono = "", nuevoWhatsapp = "") {
    whatsappTocado.current = nuevoWhatsapp.trim().length > 0 && nuevoWhatsapp !== nuevoTelefono;
    setTelefonoState(nuevoTelefono);
    setWhatsappState(nuevoWhatsapp);
  }

  return { telefono, whatsapp, setTelefono, setWhatsapp, reset };
}
