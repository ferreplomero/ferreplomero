import { Card, Skeleton } from "@arkiteq/ui";

export default function CajaLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-5 w-64" />
      </div>
      <Card className="space-y-4 p-6">
        <Skeleton className="h-5 w-48" />
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
        <Skeleton className="h-10 w-36" />
      </Card>
    </div>
  );
}
