import Image from "next/image";

/**
 * Fondo fotográfico a pantalla completa (herramientas de plomería, foto de
 * Unsplash bajo Unsplash License) con velo oscuro y destellos de marca para
 * que el contenido encima mantenga contraste AA.
 */
export function FondoPremium() {
  return (
    <div aria-hidden="true" className="fixed inset-0 -z-10 overflow-hidden bg-[#0B1418]">
      <Image
        src="/fondo-ferreteria.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="scale-105 object-cover opacity-45 blur-[2px]"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B1418]/70 via-[#0B1418]/55 to-[#0B1418]/90" />
      <div className="absolute -left-40 -top-40 size-[36rem] rounded-full bg-[#1B9DC2]/25 blur-3xl" />
      <div className="absolute -bottom-48 -right-40 size-[36rem] rounded-full bg-[#E07B26]/20 blur-3xl" />
      <div className="absolute inset-0 [background:radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.55)_100%)]" />
    </div>
  );
}
