const PERIODOS = [
  { key: "hoy", label: "Hoy" },
  { key: "semana", label: "7 días" },
  { key: "mes", label: "30 días" },
  { key: "mes-anterior", label: "Mes anterior" },
] as const;

/** Filtro de período (día/mes/rango) para Libro Diario y Libro Mayor —
 * mismo patrón de pills que usa Reportes (`?periodo=`), más un rango libre
 * (`?desde=&hasta=`) para "solo el rango pedido" (cuidando que el rango se
 * resuelve en el servidor con la zona horaria del negocio, ver
 * `rangoLocalAUtc`/`rangoPreset`). */
export function FiltroPeriodoLibro({
  base,
  periodo,
  desde,
  hasta,
}: {
  base: string;
  periodo: string;
  desde?: string;
  hasta?: string;
}) {
  const rangoActivo = Boolean(desde && hasta);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-1">
        {PERIODOS.map((p) => (
          <a
            key={p.key}
            href={`${base}?periodo=${p.key}`}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              !rangoActivo && periodo === p.key
                ? "bg-accent-500 text-white"
                : "border-border text-muted-foreground hover:text-heading border"
            }`}
          >
            {p.label}
          </a>
        ))}
      </div>
      <form method="get" action={base} className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          name="desde"
          defaultValue={desde}
          required
          className="border-border bg-background h-8 rounded-md border px-2 text-xs"
        />
        <span className="text-muted-foreground text-xs">a</span>
        <input
          type="date"
          name="hasta"
          defaultValue={hasta}
          required
          className="border-border bg-background h-8 rounded-md border px-2 text-xs"
        />
        <button
          type="submit"
          className="border-border text-heading hover:bg-surface-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
        >
          Ver rango
        </button>
      </form>
    </div>
  );
}
