import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Boxes, HandCoins, Wrench } from "lucide-react";

export const metadata: Metadata = {
  title: { absolute: "Ferreplomero — Ferretería y Plomería" },
  description:
    "Todo para tus proyectos de construcción y plomería. Ferretería y plomería con amplio inventario, atención experta y precios justos.",
};

const FEATURES = [
  {
    icon: Boxes,
    title: "Amplio inventario",
    description: "Materiales de ferretería y plomería para cada etapa de tu proyecto.",
  },
  {
    icon: Wrench,
    title: "Atención experta",
    description:
      "Te asesoramos para elegir el producto correcto y resolver tu problema a la primera.",
  },
  {
    icon: HandCoins,
    title: "Precios justos",
    description: "Precios competitivos y transparentes, sin sorpresas al pagar.",
  },
] as const;

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="border-b border-black/5">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-4">
          <Image
            src="/logo.png"
            alt="Ferreplomero"
            width={40}
            height={40}
            className="rounded-full"
          />
          <span className="text-lg font-semibold text-[#1A1A1A]">Ferreplomero</span>
        </div>
      </header>

      <section className="bg-[#1B9DC2] px-5 py-16 text-center text-white sm:py-24">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6">
          <Image
            src="/logo.png"
            alt="Ferreplomero"
            width={120}
            height={120}
            priority
            className="rounded-full shadow-lg"
          />
          <h1 className="text-3xl font-bold sm:text-5xl">Ferreplomero — Ferretería y Plomería</h1>
          <p className="max-w-xl text-base text-white/90 sm:text-lg">
            Todo para tus proyectos de construcción y plomería.
          </p>
          <Link
            href="/minimarket"
            className="inline-flex items-center justify-center rounded-md bg-[#E07B26] px-8 py-3 text-base font-semibold text-white shadow-md transition hover:bg-[#c96a1f]"
          >
            Entrar al sistema
          </Link>
        </div>
      </section>

      <section className="px-5 py-16 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-6 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div key={title} className="rounded-xl border border-black/5 bg-white p-6 shadow-sm">
              <div className="mb-4 inline-flex size-12 items-center justify-center rounded-full bg-[#2563EB]/10 text-[#2563EB]">
                <Icon className="size-6" />
              </div>
              <h2 className="text-lg font-semibold text-[#1A1A1A]">{title}</h2>
              <p className="mt-2 text-sm text-[#1A1A1A]/70">{description}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-auto border-t border-black/5 bg-white px-5 py-6 text-center text-sm text-[#1A1A1A]/60">
        © 2026 Ferreplomero. Todos los derechos reservados.
      </footer>
    </div>
  );
}
