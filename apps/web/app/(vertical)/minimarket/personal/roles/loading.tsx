import { Card, Skeleton } from "@arkiteq/ui";

export default function PersonalRolesLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="h-6 w-full" />
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
