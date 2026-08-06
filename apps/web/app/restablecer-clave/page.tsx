import type { Metadata } from "next";
import Link from "next/link";
import { NodeGraphBackdrop } from "@arkiteq/ui";
import { BrandLogo } from "@/components/brand-logo";
import { RestablecerClaveForm } from "./restablecer-clave-form";

export const metadata: Metadata = {
  title: "Establecer nueva contraseña",
  description: "Elige una nueva contraseña para tu cuenta de Arkiteq Data.",
};

/**
 * Aterrizaje del enlace de recuperación de contraseña (tanto el que el
 * cliente pide desde "¿Olvidaste tu contraseña?" como el que un admin le
 * envía desde el panel — ver `enviarRecuperacionClienteAction`). El callback
 * de auth (`/auth/callback`) ya intercambió el código por una sesión antes de
 * llegar aquí, así que solo falta pedirle la contraseña nueva.
 */
export default function RestablecerClavePage() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-12">
      <NodeGraphBackdrop className="opacity-60 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />

      <div className="relative w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Link href="/" aria-label="Arkiteq Data, inicio" className="rounded-md">
            <BrandLogo className="h-10" priority />
          </Link>
        </div>
        <div className="border-border bg-surface space-y-6 rounded-2xl border p-8 shadow-lg">
          <div className="space-y-1.5 text-center">
            <h1 className="font-display text-heading text-2xl font-semibold">
              Establece tu nueva contraseña
            </h1>
            <p className="text-muted-foreground text-sm">
              Elige una contraseña nueva para volver a entrar a tu cuenta.
            </p>
          </div>
          <RestablecerClaveForm />
        </div>
      </div>
    </div>
  );
}
