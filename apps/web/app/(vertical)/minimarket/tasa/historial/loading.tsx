import { Card, Skeleton } from "@arkiteq/ui";

export default function HistorialTasaLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-64" />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-border border-b px-4 py-3">
          <Skeleton className="h-5 w-36" />
        </div>
        <div className="divide-border divide-y">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
