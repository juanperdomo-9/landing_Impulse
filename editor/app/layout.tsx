import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
// Inter is still used to draw texts and subtitles inside the video canvas
import "@fontsource-variable/inter";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const sans = DM_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://editor.impulsastudiodigital.com.ar"),
  title: "Impulsa Studio — Editor de video con IA",
  description:
    "Sube tus videos en crudo y dile a la IA lo que quieres: subtítulos automáticos, cortes de silencios, fotos, música, efectos de sonido y efectos visuales.",
};

export const viewport: Viewport = { themeColor: "#0A0F2C" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${display.variable} ${sans.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
