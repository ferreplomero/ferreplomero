import type { Metadata } from "next";
import { BancosTipoView } from "../tipo-view";

export const metadata: Metadata = { title: "Bancos — Pago Móvil" };

export default function BancosPagoMovilPage() {
  return <BancosTipoView metodo="pago_movil" />;
}
