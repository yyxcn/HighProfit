import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 정적 배포가 기본 (Capacitor 포장 대비). 서버 로직은 별도 서비스로 분리 — ../../CLAUDE.md 참고.
  output: "export",
  images: { unoptimized: true },
  transpilePackages: ["@highprofit/core"],
  // dev 모드 좌하단 N 인디케이터 숨김 (프로덕션엔 원래 안 뜸)
  devIndicators: false,
};

export default nextConfig;
