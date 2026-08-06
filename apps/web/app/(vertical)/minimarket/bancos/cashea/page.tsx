import type { Metadata } from "next";
import { BancosTipoView } from "../tipo-view";

export const metadata: Metadata = { title: "Bancos — Cashea" };

export default function BancosCasheaPage() {
  return <BancosTipoView metodo="cashea" />;
}
