import { Card, Skeleton } from "@arkiteq/ui";

export default function CompraDetalleLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
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
          <Skeleton className="h-6 w-28 rounded-full" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
      </div>

      {/* Datos de la compra */}
      <Card className="grid gap-4 p-5 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </Card>

      {/* Items */}
      <Card className="overflow-hidden p-0">
        <div className="border-border border-b px-4 py-3">
          <Skeleton className="h-5 w-36" />
        </div>
        <div className="divide-border divide-y">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
        <div className="border-border border-t px-4 py-3 text-right">
          <Skeleton className="ml-auto h-5 w-32" />
        </div>
      </Card>
    </div>
  );
}
