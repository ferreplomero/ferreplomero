import { Skeleton } from "@arkiteq/ui";

export default function NuevoProveedorLoading() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-7 w-40" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
        <Skeleton className="h-10 w-32" />
      </div>
    </div>
  );
}
