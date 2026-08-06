import { Card, Skeleton } from "@arkiteq/ui";

export default function MorososLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-72" />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-border border-b px-4 py-3">
          <Skeleton className="h-5 w-36" />
        </div>
        <div className="divide-border divide-y">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-28 rounded-md" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
