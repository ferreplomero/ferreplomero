import { Card, Skeleton } from "@arkiteq/ui";

export default function SincronizacionLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-5 w-80" />
      </div>
      <Card className="flex items-center justify-between gap-4 p-6">
        <div className="flex items-center gap-3">
          <Skeleton className="size-11 rounded-xl" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
        <Skeleton className="h-7 w-24 rounded-full" />
      </Card>
      <section className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="space-y-3 p-5">
            <Skeleton className="size-9 rounded-xl" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </Card>
        ))}
      </section>
    </div>
  );
}
