import { Card, Skeleton } from "@arkiteq/ui";

export default function RecibosLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-5 w-56" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="flex items-center gap-4 p-4">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <div className="space-y-1 text-right">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-9 w-24 shrink-0 rounded-md" />
          </Card>
        ))}
      </div>
    </div>
  );
}
