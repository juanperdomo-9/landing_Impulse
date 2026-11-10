import Link from "next/link";

/** Impulsa Studio logo on its white chip, the same look as impulsastudiodigital.com.ar. */
export default function BrandLogo({ href = "/", size = "md" }: { href?: string; size?: "sm" | "md" }) {
  const height = size === "sm" ? 26 : 34;
  return (
    <Link href={href} className="brand-chip" aria-label="Impulsa Studio, ir al inicio">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/impulsa-logo.jpeg" alt="Impulsa Studio" height={height} style={{ height, width: "auto" }} />
    </Link>
  );
}
