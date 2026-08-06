import { notFound } from "next/navigation";
import { Card } from "@arkiteq/ui";
import { getNavItem } from "@/lib/minimarket/nav";

/**
 * Estado vacío de un módulo del vertical aún sin lógica (Fase 1: estructura).
 * Toma su contenido del catálogo de navegación, así que no hay textos sueltos.
 */
export function ModuloPendiente({ href }: { href: string }) {
  const item = getNavItem(href);
  if (!item) notFound();

  const Icon = item.icon;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-heading text-2xl font-semibold">{item.label}</h1>
        <p className="text-muted-foreground">{item.description}</p>
      </header>

      <Card className="flex flex-col items-center gap-4 p-6 text-center sm:p-10">
        <span className="bg-accent-500/12 text-accent-600 inline-flex size-14 items-center justify-center rounded-2xl">
          <Icon className="size-7" aria-hidden />
        </span>
        <div className="space-y-1">
          <p className="font-display text-heading text-lg font-semibold">Módulo en construcción</p>
          <p className="text-muted-foreground mx-auto max-w-md text-sm">
            Forma parte del MVP y se construye por fases para entregar calidad de producción, sin
            versiones básicas.
          </p>
        </div>
        <span className="bg-accent-50 text-accent-600 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium">
          Llega en la Fase {item.fase}
        </span>
      </Card>
    </div>
  );
}
