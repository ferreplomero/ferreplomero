import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        brand: "bg-brand-50 text-brand-600 border-transparent",
        neutral: "border-border bg-surface-2 text-muted-foreground",
        success: "bg-success/12 text-success border-transparent",
        warning: "bg-warning/12 text-warning border-transparent",
        danger: "bg-danger/12 text-danger border-transparent",
        outline: "border-border text-heading",
      },
    },
    defaultVariants: {
      variant: "brand",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
