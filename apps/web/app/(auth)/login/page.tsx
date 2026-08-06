import type { Metadata } from "next";
import Link from "next/link";
import { Separator } from "@arkiteq/ui";
import { LoginForm } from "@/components/auth/login-form";
import { GoogleButton } from "@/components/auth/google-button";

export const metadata: Metadata = {
  title: "Iniciar sesión",
  description: "Accede a tu cuenta de Arkiteq Data.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ siguiente?: string }>;
}) {
  const { siguiente } = await searchParams;

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="font-display text-heading text-2xl font-semibold">Bienvenido de vuelta</h1>
        <p className="text-muted-foreground text-sm">Inicia sesión para gestionar tu negocio.</p>
      </div>

      <GoogleButton />

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-muted-foreground text-xs uppercase tracking-wide">o</span>
        <Separator className="flex-1" />
      </div>

      <LoginForm next={siguiente} />

      <p className="text-muted-foreground text-center text-sm">
        ¿No tienes cuenta?{" "}
        <Link href="/registro" className="text-brand-600 font-medium hover:underline">
          Crear cuenta
        </Link>
      </p>
    </div>
  );
}
