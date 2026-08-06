interface TableroHeaderProps {
  nombreNegocio: string;
  fechaLarga: string;
}

export function TableroHeader({ nombreNegocio, fechaLarga }: TableroHeaderProps) {
  return (
    <header className="animate-fade-up space-y-3 motion-reduce:animate-none">
      <div className="flex flex-wrap items-center gap-2">
        <span className="bg-accent-500/10 text-accent-600 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
          <span className="bg-accent-500 inline-block size-1.5 rounded-full" aria-hidden />
          Minimarket
        </span>
      </div>
      <div>
        <p className="text-muted-foreground text-sm font-medium">Bienvenido,</p>
        <h1 className="font-display text-heading text-3xl font-bold tracking-tight sm:text-4xl">
          {nombreNegocio}
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm capitalize">{fechaLarga}</p>
      </div>
    </header>
  );
}
