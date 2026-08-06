import { Card, Skeleton } from "@arkiteq/ui";

export default function GananciasLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>
      <div className="space-y-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-5 w-96 max-w-full" />
        </div>
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Card className="divide-border divide-y p-0">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-3 px-5 py-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-lg" />
              <Skeleton className="h-4 w-40" />
            </div>
            <div className="space-y-1 text-right">
              <Skeleton className="ml-auto h-5 w-20" />
              <Skeleton className="ml-auto h-3 w-16" />
            </div>
          </div>
        ))}
      </Card>
      <Card className="space-y-2 p-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-4/6" />
      </Card>
      <Card className="space-y-4 p-5">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-56 w-full" />
      </Card>
      <Card className="overflow-hidden p-0">
        <div className="border-border border-b px-4 py-3">
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="space-y-3 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </Card>
      <Card className="overflow-hidden p-0">
        <div className="border-border border-b px-4 py-3">
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="space-y-3 p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </Card>
    </div>
  );
}
