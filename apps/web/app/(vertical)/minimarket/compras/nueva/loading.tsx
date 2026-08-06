import { Card, Skeleton } from "@arkiteq/ui";

export default function NuevaCompraLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Datos del encabezado */}
      <Card className="grid gap-4 p-5 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        ))}
      </Card>

      {/* Buscador de productos */}
      <Card className="space-y-4 p-5">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-9 w-full rounded-md" />
        <div className="divide-border divide-y rounded-md border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-8 w-24 rounded-md" />
              <Skeleton className="h-8 w-28 rounded-md" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          ))}
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-40 rounded-md" />
      </div>
    </div>
  );
}
