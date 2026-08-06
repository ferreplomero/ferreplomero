import { Card, Skeleton } from "@arkiteq/ui";

export default function ProductoDetalleLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-28" />
        <span className="text-muted-foreground">/</span>
        <Skeleton className="h-4 w-36" />
      </div>

      {/* Header */}
      <div className="flex items-start gap-4">
        <Skeleton className="size-20 shrink-0 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-32" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
        </div>
      </div>

      {/* Tarjetas de métricas */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="space-y-2 p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-24" />
          </Card>
        ))}
      </section>

      {/* Precios */}
      <Card className="space-y-3 p-5">
        <Skeleton className="h-5 w-32" />
        <div className="divide-border divide-y">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-28" />
            </div>
          ))}
        </div>
      </Card>

      {/* Historial de movimientos */}
      <Card className="overflow-hidden p-0">
        <div className="border-border border-b px-4 py-3">
          <Skeleton className="h-5 w-44" />
        </div>
        <div className="divide-border divide-y">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
