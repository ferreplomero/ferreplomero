import type { Metadata } from "next";
import { SyncPanel } from "@/components/minimarket/sync-panel-cargador";

export const metadata: Metadata = { title: "Sincronización" };

export default function SincronizacionPage() {
  return <SyncPanel />;
}
