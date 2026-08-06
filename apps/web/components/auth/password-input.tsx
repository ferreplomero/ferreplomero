"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input, type InputProps } from "@arkiteq/ui";

/** Input de contraseña con icono de ojito para mostrar/ocultar el texto. */
export const PasswordInput = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          className={`pr-10 ${className ?? ""}`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="text-muted-foreground hover:text-heading focus-visible:ring-ring absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md transition-colors focus-visible:outline-none focus-visible:ring-2"
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={visible}
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";
