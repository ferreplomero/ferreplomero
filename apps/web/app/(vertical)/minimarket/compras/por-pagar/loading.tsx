import { Card, Skeleton } from "@arkiteq/ui";

export default function ComprasPorPagarLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-border border-b px-4 py-3">
          <Skeleton className="h-5 w-36" />
        </div>
        <div className="divide-border divide-y">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-28 rounded-md" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
