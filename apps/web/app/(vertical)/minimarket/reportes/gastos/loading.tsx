import { Card, Skeleton } from "@arkiteq/ui";

export default function GastosOperativosLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-5 w-96 max-w-full" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>
      <Card className="overflow-hidden p-0">
        <div className="border-border border-b px-4 py-3">
          <Skeleton className="h-5 w-20" />
        </div>
        <div className="divide-border divide-y">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
