import { Card, Skeleton } from "@arkiteq/ui";

export default function AjustesLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-60" />
        </div>
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-border border-b px-4 py-3">
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="divide-border divide-y">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
