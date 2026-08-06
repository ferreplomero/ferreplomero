import { Card, Skeleton } from "@arkiteq/ui";

export default function VentaDetalleLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-24" />
        <span className="text-muted-foreground">/</span>
        <Skeleton className="h-4 w-28" />
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
      </div>

      {/* Datos de la venta */}
      <Card className="grid gap-4 p-5 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </Card>

      {/* Líneas de venta */}
      <Card className="overflow-hidden p-0">
        <div className="border-border border-b px-4 py-3">
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="divide-border divide-y">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
        <div className="border-border space-y-2 border-t px-4 py-3 text-right">
          <Skeleton className="ml-auto h-4 w-32" />
          <Skeleton className="ml-auto h-5 w-36" />
        </div>
      </Card>

      {/* Pagos */}
      <Card className="space-y-3 p-5">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </Card>
    </div>
  );
}
