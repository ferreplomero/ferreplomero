import Image from "next/image";
import Link from "next/link";
import { CreditoArkiteq } from "@/components/credito-arkiteq";
import { FondoPremium } from "@/components/fondo-premium";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col">
      <FondoPremium />

      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex justify-center">
            <Link
              href="/"
              aria-label="Ferreplomero, inicio"
              className="flex flex-col items-center gap-3 rounded-md"
            >
              <Image
                src="/logo.png"
                alt="Ferreplomero"
                width={80}
                height={80}
                priority
                className="rounded-full shadow-2xl ring-4 ring-white/15"
              />
              <span className="font-display text-2xl font-bold tracking-tight text-white">
                Ferreplomero
              </span>
            </Link>
          </div>
          <div className="bg-surface rounded-2xl border border-white/20 p-7 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] ring-1 ring-white/10 backdrop-blur-xl sm:p-8">
            {children}
          </div>
        </div>
      </main>

      <CreditoArkiteq tono="oscuro" />
    </div>
  );
}
