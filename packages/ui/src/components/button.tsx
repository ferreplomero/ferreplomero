import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

const buttonVariants = cva(
  "focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[background-color,box-shadow,transform,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-brand-500 hover:bg-brand-600 text-white shadow-sm hover:shadow-md",
        secondary: "bg-surface-2 text-heading hover:bg-border/60 shadow-xs",
        outline: "border-border bg-surface text-heading hover:bg-surface-2 border",
        ghost: "text-heading hover:bg-surface-2",
        link: "text-brand-600 underline-offset-4 hover:underline",
        danger: "bg-danger text-white shadow-sm hover:opacity-90",
      },
      size: {
        sm: "h-9 px-3.5 text-sm",
        default: "h-10 px-5",
        lg: "h-12 px-7 text-base",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Renderiza el componente hijo en vez de un <button> (composición). */
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        type={asChild ? undefined : (type ?? "button")}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
