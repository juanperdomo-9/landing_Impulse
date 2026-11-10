import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: "Impulsa Studio — Editor de video con IA",
  description:
    "Sube tus videos en crudo y dile a la IA lo que quieres: subtítulos automáticos, cortes de silencios, fotos, música, efectos de sonido y efectos visuales.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
