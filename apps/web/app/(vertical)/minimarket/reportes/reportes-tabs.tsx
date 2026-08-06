import Link from "next/link";

const SECCIONES = [
  { href: "/minimarket/reportes", label: "Resumen general" },
  { href: "/minimarket/reportes/ganancias", label: "Ganancias" },
  { href: "/minimarket/reportes/gastos", label: "Gastos operativos" },
  { href: "/minimarket/reportes/otros-ingresos", label: "Otros ingresos" },
] as const;

/** Tabs de navegación entre las secciones de Reportes (Resumen general, Ganancias, Gastos, Otros ingresos). */
export function ReportesTabs({ activo }: { activo: (typeof SECCIONES)[number]["href"] }) {
  return (
    <nav
      className="border-border flex flex-wrap gap-1 border-b pb-px"
      aria-label="Secciones de reportes"
    >
      {SECCIONES.map((s) => {
        const seleccionado = s.href === activo;
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={seleccionado ? "page" : undefined}
            className={`rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              seleccionado
                ? "border-accent-500 text-heading"
                : "text-muted-foreground hover:text-heading border-transparent"
            }`}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
