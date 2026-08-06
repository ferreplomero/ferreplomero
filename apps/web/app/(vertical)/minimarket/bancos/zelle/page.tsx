import type { Metadata } from "next";
import { BancosTipoView } from "../tipo-view";

export const metadata: Metadata = { title: "Bancos — Zelle" };

export default function BancosZellePage() {
  return <BancosTipoView metodo="zelle" />;
}
