import { Card, Skeleton } from "@arkiteq/ui";

export default function ClientesLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-5 w-56" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>
      <Skeleton className="h-10 w-72" />
      <Card className="overflow-hidden p-0">
        <div className="border-border border-b p-4">
          <Skeleton className="h-5 w-48" />
        </div>
        <div className="divide-border divide-y">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
