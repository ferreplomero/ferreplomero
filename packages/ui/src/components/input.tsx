import * as React from "react";
import { cn } from "../lib/cn";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "border-border bg-surface text-heading shadow-xs flex h-10 w-full rounded-md border px-3.5 py-2 text-sm transition-colors",
        "placeholder:text-muted-foreground",
        "focus-visible:border-brand-500 focus-visible:ring-ring/40 focus-visible:outline-none focus-visible:ring-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/30",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
