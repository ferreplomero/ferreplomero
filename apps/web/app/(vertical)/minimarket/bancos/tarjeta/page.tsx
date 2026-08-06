import type { Metadata } from "next";
import { BancosTipoView } from "../tipo-view";

export const metadata: Metadata = { title: "Bancos — Tarjeta / Punto" };

export default function BancosTarjetaPage() {
  return <BancosTipoView metodo="tarjeta" />;
}
