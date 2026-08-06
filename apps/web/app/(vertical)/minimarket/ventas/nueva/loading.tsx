import { Card, Skeleton } from "@arkiteq/ui";

export default function NuevaVentaLoading() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-5 w-72" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <Card key={i} className="overflow-hidden p-0">
                <Skeleton className="aspect-square w-full" />
                <div className="space-y-1.5 p-2.5">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </Card>
            ))}
          </div>
        </div>
        <Card className="h-fit p-4">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="mt-6 h-20 w-full" />
          <Skeleton className="mt-4 h-10 w-full" />
        </Card>
      </div>
    </div>
  );
}
