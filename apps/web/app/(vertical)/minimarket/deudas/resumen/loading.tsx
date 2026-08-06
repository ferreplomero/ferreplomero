import { Card, Skeleton } from "@arkiteq/ui";

export default function ResumenDeudasLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-5 w-80 max-w-full" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="flex items-center gap-3 p-4">
            <Skeleton className="size-10 shrink-0 rounded-xl" />
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-16" />
            </div>
          </Card>
        ))}
      </div>
      <Card className="space-y-4 p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-48 w-full" />
      </Card>
      <Card className="overflow-hidden p-0">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="border-border flex items-center justify-between gap-3 border-b px-4 py-3 last:border-0"
          >
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </Card>
    </div>
  );
}
