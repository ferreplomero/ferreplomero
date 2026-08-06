import { Card, Skeleton } from "@arkiteq/ui";

export default function ComprasLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-5 w-56" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>
      <Card className="overflow-hidden p-0">
        <div className="border-border border-b p-4">
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="divide-border divide-y">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
