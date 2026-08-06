import Link from "next/link";
import { ArkiteqMark, Button, NodeGraphBackdrop } from "@arkiteq/ui";

export default function NotFound() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 text-center">
      <NodeGraphBackdrop className="opacity-50 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      <div className="relative">
        <ArkiteqMark className="text-brand-500 mx-auto size-12" />
        <p className="font-display text-heading mt-8 text-6xl font-semibold">404</p>
        <h1 className="font-display text-heading mt-2 text-xl font-semibold">
          No encontramos esta página
        </h1>
        <p className="text-muted-foreground mt-2 max-w-sm">
          Puede que el enlace haya cambiado o que la página ya no exista.
        </p>
        <Button asChild className="mt-8">
          <Link href="/">Volver al inicio</Link>
        </Button>
      </div>
    </div>
  );
}
