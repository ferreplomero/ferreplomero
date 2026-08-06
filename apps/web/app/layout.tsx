import type { Metadata, Viewport } from "next";
import { displayFont, sansFont } from "@arkiteq/ui/fonts";
import { SITE } from "@/lib/site";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} — Software a la medida de tu negocio`,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: SITE.name, statusBarStyle: "default" },
  authors: [{ name: "Jeramine Rojas" }],
  keywords: ["SaaS", "PYMES", "Venezuela", "Colombia", "minimarket", "punto de venta"],
  openGraph: {
    type: "website",
    locale: "es_VE",
    siteName: SITE.name,
    title: `${SITE.name} — Software a la medida de tu negocio`,
    description: SITE.description,
    url: SITE.url,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F8F8" },
    { media: "(prefers-color-scheme: dark)", color: "#0E171B" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${displayFont.variable} ${sansFont.variable}`}
    >
      <body className="bg-background text-foreground min-h-dvh font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
