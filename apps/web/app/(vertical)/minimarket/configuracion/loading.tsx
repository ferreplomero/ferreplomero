import { Card, Skeleton } from "@arkiteq/ui";

export default function ConfiguracionLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-5 w-72" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <section key={i} className="space-y-4">
          <Skeleton className="h-6 w-48" />
          <Card className="space-y-4 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="space-y-1.5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ))}
            </div>
            <Skeleton className="ml-auto h-10 w-36" />
          </Card>
        </section>
      ))}
    </div>
  );
}
