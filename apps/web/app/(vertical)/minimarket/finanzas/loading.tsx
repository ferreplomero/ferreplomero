import { Card, Skeleton } from "@arkiteq/ui";

export default function FinanzasLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-5 w-72 max-w-full" />
      </div>
      <Skeleton className="h-16 w-full rounded-lg" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>
      <Card className="space-y-3 p-5">
        <Skeleton className="h-4 w-56" />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-6 w-20" />
            </div>
          ))}
        </div>
      </Card>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="space-y-2 p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-3 w-28" />
          </Card>
        ))}
      </div>
      <Card className="overflow-hidden p-0">
        <div className="border-border border-b px-5 py-4">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="space-y-3 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </Card>
      <Card className="overflow-hidden p-0">
        <div className="border-border border-b px-5 py-4">
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="space-y-3 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </Card>
    </div>
  );
}
