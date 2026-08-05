import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 서버 없는 정적 배포. SSR/API Routes 금지 (Capacitor 포장 대비).
  output: "export",
  images: { unoptimized: true },
  transpilePackages: ["@highprofit/core"],
};

export default nextConfig;
