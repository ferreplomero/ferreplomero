import type { Metadata } from "next";
import Image from "next/image";
import { LoginForm } from "@/components/auth/login-form";
import { CreditoArkiteq } from "@/components/credito-arkiteq";
import { FondoPremium } from "@/components/fondo-premium";

export const metadata: Metadata = {
  title: { absolute: "Ferreplomero — Ferretería y Plomería" },
  description:
    "Todo para tus proyectos de construcción y plomería. Ferretería y plomería con amplio inventario, atención experta y precios justos.",
};

/**
 * Portada: login centrado sobre fondo fotográfico, con la paleta del logo de
 * Ferreplomero (`.theme-ferreplomero`, scopeada solo a esta pantalla). Solo
 * correo y contraseña: sin Google ni creación de cuentas (las cuentas las da
 * el dueño desde Personal). Con sesión activa, el middleware redirige de "/"
 * al panel.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ siguiente?: string }>;
}) {
  const { siguiente } = await searchParams;

  return (
    <div className="theme-ferreplomero relative isolate flex min-h-dvh flex-col">
      <FondoPremium />

      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-[#067AAD]/60 blur-2xl" />
              <Image
                src="/logo.png"
                alt="Ferreplomero"
                width={104}
                height={104}
                priority
                className="relative rounded-full shadow-2xl ring-4 ring-white/90"
              />
            </div>
            <h1 className="font-display mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Ferre<span className="text-[#E57825]">plomero</span>
            </h1>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.3em] text-[#8fd0ef]">
              Ferretería · Plomería
            </p>
          </div>

          <div className="bg-surface overflow-hidden rounded-2xl shadow-[0_30px_80px_-20px_rgba(4,16,34,0.8)] ring-1 ring-white/20">
            <div className="h-1.5 bg-gradient-to-r from-[#0270B7] via-[#067AAD] to-[#E57825]" />
            <div className="space-y-6 p-7 sm:p-8">
              <div className="space-y-1.5 text-center">
                <h2 className="font-display text-heading text-2xl font-semibold">
                  Bienvenido de vuelta
                </h2>
                <p className="text-muted-foreground text-sm">
                  Inicia sesión para gestionar tu negocio.
                </p>
              </div>

              <LoginForm next={siguiente} />
            </div>
          </div>
        </div>
      </main>

      <CreditoArkiteq tono="oscuro" />
    </div>
  );
}
