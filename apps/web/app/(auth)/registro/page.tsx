import type { Metadata } from "next";
import Link from "next/link";
import { Separator } from "@arkiteq/ui";
import { SignUpForm } from "@/components/auth/signup-form";
import { GoogleButton } from "@/components/auth/google-button";

export const metadata: Metadata = {
  title: "Crear cuenta",
  description: "Crea tu cuenta de Arkiteq Data y elige el software para tu negocio.",
};

export default function RegistroPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="font-display text-heading text-2xl font-semibold">Crea tu cuenta</h1>
        <p className="text-muted-foreground text-sm">
          Un registro para acceder a todo el catálogo.
        </p>
      </div>

      <GoogleButton />

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-muted-foreground text-xs uppercase tracking-wide">o</span>
        <Separator className="flex-1" />
      </div>

      <SignUpForm />

      <p className="text-muted-foreground text-center text-xs leading-relaxed">
        Al crear tu cuenta aceptas operar de forma responsable con tus datos y los de tus clientes.
      </p>

      <p className="text-muted-foreground text-center text-sm">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="text-brand-600 font-medium hover:underline">
          Inicia sesión
        </Link>
      </p>
    </div>
  );
}
