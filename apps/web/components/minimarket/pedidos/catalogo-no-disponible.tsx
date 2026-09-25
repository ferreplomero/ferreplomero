/** Pantalla para un slug inexistente o un catálogo desactivado. */
export function CatalogoNoDisponible() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-heading text-xl font-semibold">Catálogo no disponible</h1>
      <p className="text-muted-foreground text-sm">
        Este catálogo no existe o el negocio lo desactivó temporalmente.
      </p>
    </div>
  );
}
