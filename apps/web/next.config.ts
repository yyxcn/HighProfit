import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 서버 없는 정적 배포. SSR/API Routes 금지 (Capacitor 포장 대비).
  output: "export",
  images: { unoptimized: true },
  transpilePackages: ["@highprofit/core"],
  // dev 모드 좌하단 N 인디케이터 숨김 (프로덕션엔 원래 안 뜸)
  devIndicators: false,
};

export default nextConfig;
