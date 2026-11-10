import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // the editor is served at impulsastudiodigital.com.ar/editor (keep in sync with BASE_PATH in lib/paths.ts)
  basePath: "/editor",
};

export default nextConfig;
