import { Card, Skeleton } from "@arkiteq/ui";

export default function ProveedoresLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-5 w-56" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>
      <Card className="overflow-hidden p-0">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="border-border flex items-center gap-4 border-b px-4 py-4 last:border-0"
          >
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </Card>
    </div>
  );
}
