import * as React from "react";
import { cn } from "../lib/cn";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("bg-surface-2 animate-pulse rounded-md", className)}
      {...props}
    />
  );
}

export { Skeleton };
