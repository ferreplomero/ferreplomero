import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Separator } from "@arkiteq/ui";
import { LoginForm } from "@/components/auth/login-form";
import { GoogleButton } from "@/components/auth/google-button";
import { CreditoArkiteq } from "@/components/credito-arkiteq";
import { FondoPremium } from "@/components/fondo-premium";

export const metadata: Metadata = {
  title: { absolute: "Ferreplomero — Ferretería y Plomería" },
  description:
    "Todo para tus proyectos de construcción y plomería. Ferretería y plomería con amplio inventario, atención experta y precios justos.",
};

/**
 * Portada: acceso directo al sistema (login centrado sobre fondo fotográfico).
 * Con sesión activa, el middleware redirige de "/" al panel.
 */
export default function HomePage() {
  return (
    <div className="relative isolate flex min-h-dvh flex-col">
      <FondoPremium />

      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-[#1B9DC2]/40 blur-xl" />
              <Image
                src="/logo.png"
                alt="Ferreplomero"
                width={96}
                height={96}
                priority
                className="relative rounded-full shadow-2xl ring-4 ring-white/15"
              />
            </div>
            <h1 className="font-display mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Ferreplomero
            </h1>
            <p className="mt-1.5 text-xs font-medium uppercase tracking-[0.25em] text-white/60">
              Ferretería · Plomería
            </p>
          </div>

          <div className="bg-surface rounded-2xl border border-white/20 p-7 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] ring-1 ring-white/10 backdrop-blur-xl sm:p-8">
            <div className="space-y-6">
              <div className="space-y-1.5 text-center">
                <h2 className="font-display text-heading text-2xl font-semibold">
                  Bienvenido de vuelta
                </h2>
                <p className="text-muted-foreground text-sm">
                  Inicia sesión para gestionar tu negocio.
                </p>
              </div>

              <GoogleButton />

              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-muted-foreground text-xs uppercase tracking-wide">o</span>
                <Separator className="flex-1" />
              </div>

              <LoginForm />

              <p className="text-muted-foreground text-center text-sm">
                ¿No tienes cuenta?{" "}
                <Link href="/registro" className="text-brand-600 font-medium hover:underline">
                  Crear cuenta
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>

      <CreditoArkiteq tono="oscuro" />
    </div>
  );
}
