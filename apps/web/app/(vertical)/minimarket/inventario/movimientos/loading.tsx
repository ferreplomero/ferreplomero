import { Card, Skeleton } from "@arkiteq/ui";

export default function MovimientosLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-60" />
        </div>
      </div>

      {/* Filtros */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-32" />
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-border border-b px-4 py-3">
          <Skeleton className="h-5 w-44" />
        </div>
        <div className="divide-border divide-y">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
