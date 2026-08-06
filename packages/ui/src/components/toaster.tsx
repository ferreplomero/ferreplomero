"use client";

import { useTheme } from "next-themes";
import { Toaster as SonnerToaster, type ToasterProps } from "sonner";

/**
 * Notificaciones tipo toast con estilos de marca, sincronizadas con el tema.
 * Re-exporta `toast` desde sonner para disparar avisos desde cualquier lugar.
 */
function Toaster(props: ToasterProps) {
  const { theme = "system" } = useTheme();

  return (
    <SonnerToaster
      theme={theme as ToasterProps["theme"]}
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: "group rounded-lg border border-border bg-surface text-foreground shadow-lg",
          title: "font-medium text-heading",
          description: "text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
export { toast } from "sonner";
