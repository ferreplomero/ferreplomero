import Link from "next/link";
import { NodeGraphBackdrop } from "@arkiteq/ui";
import { BrandLogo } from "@/components/brand-logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-12">
      <NodeGraphBackdrop className="opacity-60 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />

      <div className="relative w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Link href="/" aria-label="Arkiteq Data, inicio" className="rounded-md">
            <BrandLogo className="h-10" priority />
          </Link>
        </div>
        <div className="border-border bg-surface rounded-2xl border p-8 shadow-lg">{children}</div>
      </div>
    </div>
  );
}
