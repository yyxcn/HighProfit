import type { Metadata } from "next";
import { Hanken_Grotesk, IBM_Plex_Sans_KR, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Shell } from "@/components/layout/Shell";

// 라틴/디스플레이 — Hanken Grotesk (레퍼런스 톤)
const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// 한글 폴백 — IBM Plex Sans KR (Hanken 뒤에서 한글만 담당)
const plexKR = IBM_Plex_Sans_KR({
  variable: "--font-plex-kr",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

// 숫자 — JetBrains Mono
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "HighProfit — Institutional Precision",
  description: "계절성·백테스트·히트맵·13F. 서버 없는 개인 투자 분석 대시보드.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ko"
      data-theme="dark"
      className={`${hanken.variable} ${plexKR.variable} ${jetbrains.variable} h-full`}
    >
      <head>
        {/* 페인트 전 테마 적용(플래시 방지) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('hp-theme');document.documentElement.dataset.theme=t==='light'?'light':'dark';}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
