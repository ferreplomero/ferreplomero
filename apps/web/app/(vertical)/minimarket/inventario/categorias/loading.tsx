import { Card, Skeleton } from "@arkiteq/ui";

export default function CategoriasLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="space-y-3 p-4">
            <div className="flex items-start justify-between">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
          </Card>
        ))}
      </div>
    </div>
  );
}
