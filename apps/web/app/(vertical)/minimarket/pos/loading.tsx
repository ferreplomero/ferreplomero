import { Skeleton } from "@arkiteq/ui";

export default function PosLoading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4">
      <div className="flex flex-1 flex-col gap-4">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="flex-1 rounded-xl" />
      </div>
      <div className="w-80 space-y-4">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-40 flex-1 rounded-xl" />
        <Skeleton className="h-14 rounded-xl" />
      </div>
    </div>
  );
}
