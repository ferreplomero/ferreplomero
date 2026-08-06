import { Card, Skeleton } from "@arkiteq/ui";

export default function FiadoLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-5 w-64" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="space-y-2 p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-20" />
          </Card>
        ))}
      </div>
      <Card className="overflow-hidden p-0">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="border-border flex items-center gap-4 border-b px-4 py-3 last:border-0"
          >
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </Card>
    </div>
  );
}
