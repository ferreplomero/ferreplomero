import localFont from "next/font/local";

/**
 * Tipografía de marca, self-hosteada desde Fontshare (licencia libre comercial).
 * Clash Display para títulos (geométrica/grotesca con personalidad) y
 * General Sans para el cuerpo (sans muy legible). Se exponen como variables CSS
 * (--font-display, --font-sans) que consume el preset de Tailwind.
 */

export const displayFont = localFont({
  src: [
    { path: "./ClashDisplay-Medium.woff2", weight: "500", style: "normal" },
    { path: "./ClashDisplay-Semibold.woff2", weight: "600", style: "normal" },
    { path: "./ClashDisplay-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-display",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
  preload: true,
});

export const sansFont = localFont({
  src: [
    { path: "./GeneralSans-Regular.woff2", weight: "400", style: "normal" },
    { path: "./GeneralSans-Medium.woff2", weight: "500", style: "normal" },
    { path: "./GeneralSans-Semibold.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
  preload: true,
});

/** Clase utilitaria con ambas variables de fuente para aplicar en <html>. */
export const fontVariables = `${displayFont.variable} ${sansFont.variable}`;
