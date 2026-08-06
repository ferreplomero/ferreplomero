import { Card, Skeleton } from "@arkiteq/ui";

export default function TasaLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-5 w-56" />
      </div>
      <Card className="space-y-4 p-6">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-36" />
      </Card>
    </div>
  );
}
