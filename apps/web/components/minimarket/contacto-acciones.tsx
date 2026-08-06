import { Phone } from "lucide-react";
import { WhatsAppIcon } from "@arkiteq/ui";
import { normalizarTelefonoWhatsapp } from "@/lib/telefono-wa";

interface Props {
  telefono: string | null;
  whatsapp: string | null;
}

/** Botones rápidos de WhatsApp y llamada para filas de proveedores/clientes.
 * Prioriza el número de cada canal (whatsapp para chat, telefono para llamar)
 * y cae al otro campo si el registro no tiene ese número específico. */
export function ContactoAcciones({ telefono, whatsapp }: Props) {
  const numeroWhatsapp = whatsapp ?? telefono;
  const numeroLlamada = telefono ?? whatsapp;

  if (!numeroWhatsapp && !numeroLlamada) {
    return <span className="text-muted-foreground whitespace-nowrap text-xs">Sin número</span>;
  }

  return (
    <div className="flex items-center gap-1.5">
      {numeroWhatsapp ? (
        <a
          href={`https://wa.me/${normalizarTelefonoWhatsapp(numeroWhatsapp)}`}
          target="_blank"
          rel="noopener noreferrer"
          title={`Escribir por WhatsApp a ${numeroWhatsapp}`}
          aria-label={`Escribir por WhatsApp a ${numeroWhatsapp}`}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 transition-colors hover:bg-green-200"
        >
          <WhatsAppIcon className="size-3.5" aria-hidden />
        </a>
      ) : null}
      {numeroLlamada ? (
        <a
          href={`tel:${numeroLlamada}`}
          title={`Llamar a ${numeroLlamada}`}
          aria-label={`Llamar a ${numeroLlamada}`}
          className="border-border text-heading hover:bg-surface-2 inline-flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors"
        >
          <Phone className="size-3.5" aria-hidden />
        </a>
      ) : null}
    </div>
  );
}
