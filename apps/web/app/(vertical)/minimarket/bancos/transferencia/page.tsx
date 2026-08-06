import type { Metadata } from "next";
import { BancosTipoView } from "../tipo-view";

export const metadata: Metadata = { title: "Bancos — Transferencia" };

export default function BancosTransferenciaPage() {
  return <BancosTipoView metodo="transferencia" />;
}
