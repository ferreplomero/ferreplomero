import { Card, Skeleton } from "@arkiteq/ui";

export default function ProveedorDetalleLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-28" />
        <span className="text-muted-foreground">/</span>
        <Skeleton className="h-4 w-36" />
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>

      {/* Datos del proveedor */}
      <Card className="grid gap-4 p-5 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-36" />
          </div>
        ))}
      </Card>

      {/* Compras al proveedor */}
      <Card className="overflow-hidden p-0">
        <div className="border-border border-b px-4 py-3">
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="divide-border divide-y">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
