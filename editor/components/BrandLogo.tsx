import { SITE_URL, withBase } from "@/lib/paths";

/** Impulsa Studio logo on its white chip, the same look as impulsastudiodigital.com.ar. Links to the website. */
export default function BrandLogo({ size = "md" }: { size?: "sm" | "md" }) {
  const height = size === "sm" ? 26 : 34;
  return (
    <a href={`${SITE_URL}/`} className="brand-chip" aria-label="Impulsa Studio, ir a la web">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={withBase("/impulsa-logo.jpeg")} alt="Impulsa Studio" height={height} style={{ height, width: "auto" }} />
    </a>
  );
}
