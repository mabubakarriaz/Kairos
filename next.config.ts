import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lint is run as a separate CI step (`npm run lint`); don't let it gate the
  // production build. Type-checking still runs during `next build`.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
