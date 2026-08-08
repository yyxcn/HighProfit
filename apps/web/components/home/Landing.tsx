"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, ChevronDown } from "lucide-react";
import { useTheme, type Theme } from "@/lib/theme";
import { HeroCurve } from "@/components/home/HeroCurve";
import { BrandGlyph } from "@/components/layout/BrandMark";
import { cn } from "@/lib/utils";

/** 각 캡ability 를 works 리스트로 — forai 스타일 넘버드 행. */
const WORKS = [
  { href: "/chart", index: "01", title: "Chart", blurb: "캔들 · 거래량 · 이동평균. 상장 이후 전체 히스토리를 한 번에." },
  { href: "/heatmap", index: "02", title: "Heatmap", blurb: "섹터별 온도. 시총 면적 × 기간 수익률 트리맵." },
  { href: "/seasonality", index: "03", title: "Seasonality", blurb: "10년 평균 경로. 통계적 유의성(t‑stat)까지 정직하게." },
  { href: "/backtest", index: "04", title: "Backtest", blurb: "20년 데이터로 검증. 리밸런싱 · 거래비용 · MDD 반영." },
  { href: "/funds", index: "05", title: "Funds", blurb: "SEC 13F. 41개 유명 펀드의 보유 · 전분기 변화." },
];

export function Landing() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // 랜딩은 다크 전용 — 저장된 사용자 설정은 건드리지 않고 화면만 다크로 강제,
  // 앱 페이지로 이동(언마운트)하면 원래 설정으로 복원.
  useEffect(() => {
    const saved: Theme = localStorage.getItem("hp-theme") === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = "dark";
    useTheme.setState({ theme: "dark" }); // 스토어만 갱신(persist 안 함) → HeroCurve 다크 팔레트
    return () => {
      document.documentElement.dataset.theme = saved;
      useTheme.setState({ theme: saved });
    };
  }, []);

  return (
    <div className="min-h-dvh bg-ink text-fg">
      <TopNav scrolled={scrolled} />
      <Hero />
      <Marquee />
      <Works />
      <LivePreview />
      <FinalCta />
    </div>
  );
}

/* ── 상단 네비 ── */
function TopNav({ scrolled }: { scrolled: boolean }) {
  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-500",
        scrolled
          ? "bg-ink/70 backdrop-blur-xl border-b border-line"
          : "bg-transparent border-b border-transparent"
      )}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between px-5 md:px-10 h-16">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            className={cn(
              "grid place-items-center h-8 w-8 rounded-lg transition-colors",
              scrolled
                ? "bg-accent/15 border border-accent/30 text-accent"
                : "bg-white/10 border border-white/20 text-white"
            )}
          >
            <BrandGlyph />
          </span>
          <span className={cn("font-display text-[17px] tracking-tight transition-colors", scrolled ? "text-fg" : "text-white")}>
            HighProfit
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {WORKS.map((w) => (
            <Link
              key={w.href}
              href={w.href}
              className={cn(
                "px-3 py-1.5 rounded-lg text-small transition-colors",
                scrolled ? "text-fg-dim hover:text-fg hover:bg-raised/60" : "text-white/70 hover:text-white hover:bg-white/10"
              )}
            >
              {w.title}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/chart"
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-small font-semibold transition-all hover:scale-[1.03] active:scale-95",
              scrolled ? "bg-accent text-ink" : "bg-white text-black"
            )}
          >
            Login 
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ── 히어로 (뉴욕 영상 배경) ── */
function Hero() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      v.pause();
    } else {
      v.play().catch(() => {});
    }
  }, []);

  return (
    <section className="relative min-h-dvh flex flex-col justify-center overflow-hidden">
      {/* 영상 */}
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        src="/media/newyork.mp4"
        muted
        loop
        playsInline
        autoPlay
        preload="auto"
        aria-hidden
      />
      {/* 스크림 — 하단·상단 그라데이션으로 텍스트 가독성 확보 */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/20 to-black/85" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-transparent to-transparent" />

      <div className="relative z-10 max-w-5xl mx-auto w-full px-5 md:px-10 flex flex-col items-center text-center">
        <span className="fade-up num text-micro md:text-small uppercase tracking-[0.38em] text-white/55 mb-5 md:mb-7">
          Personal Investment Assistant
        </span>

        <h1 className="fade-up font-display font-semibold leading-[0.86] tracking-[-0.05em] text-[clamp(3rem,12vw,8.75rem)] drop-shadow-[0_6px_50px_rgba(0,0,0,0.5)] px-[0.12em]">
          <span className="italic bg-gradient-to-b from-white via-white to-white/50 bg-clip-text text-transparent pr-[0.14em]">High</span>
          <span className="italic bg-gradient-to-b from-accent via-accent to-accent-dim bg-clip-text text-transparent pr-[0.14em]">Profit</span>
        </h1>

        <div className="fade-up flex flex-col sm:flex-row items-center justify-center gap-3 mt-10 md:mt-12" style={{ animationDelay: "0.16s" }}>
          <Link
            href="/chart"
            className="group inline-flex items-center gap-2.5 pl-7 pr-5 py-4 rounded-full bg-white text-black font-semibold text-[15px] transition-transform hover:scale-[1.03] active:scale-95"
          >
            Get started
            <span className="grid place-items-center h-7 w-7 rounded-full bg-black text-white transition-transform group-hover:translate-x-0.5">
              <ArrowRight size={15} />
            </span>
          </Link>
          <a
            href="#works"
            className="inline-flex items-center gap-2 px-6 py-4 rounded-full border border-white/25 bg-white/5 backdrop-blur-md text-white font-medium text-[15px] transition-colors hover:bg-white/10"
          >
            How it Works
          </a>
        </div>
      </div>

      {/* 스크롤 인디케이터 */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1 text-white/50">
        <span className="num text-micro uppercase tracking-[0.2em]">Scroll</span>
        <ChevronDown size={16} className="animate-bounce" />
      </div>
    </section>
  );
}

/* ── 마퀴 스트립 ── */
function Marquee() {
  const items = ["S&P 500", "NASDAQ", "DJIA", "KOSPI", "KOSDAQ", "NIKKEI", "SHCOMP", "DAX", "FTSE", "HSI"];
  const row = [...items, ...items];
  return (
    <div className="border-y border-line bg-surface/40 overflow-hidden py-4">
      <div className="flex whitespace-nowrap animate-marquee gap-8">
        {row.map((t, i) => (
          <span key={i} className="num text-small uppercase tracking-[0.2em] text-fg-mute flex items-center gap-8">
            {t}
            <span className="h-1 w-1 rounded-full bg-accent/50" />
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Works (forai 스타일 넘버드 리스트) ── */
function Works() {
  return (
    <section id="works" className="max-w-7xl mx-auto px-5 md:px-10 py-24 md:py-32">
      <div className="flex items-end justify-between gap-6 mb-12 md:mb-16">
        <div>
          <span className="num text-micro uppercase tracking-[0.2em] text-accent">Selected Capabilities</span>
          <h2 className="font-display text-fg text-[clamp(2rem,5vw,3.5rem)] tracking-tight leading-[1.05] mt-3">
            분석을 위한 정밀 도구
          </h2>
        </div>
      </div>

      <div className="border-t border-line">
        {WORKS.map((w) => (
          <Link
            key={w.href}
            href={w.href}
            className="group relative flex items-center gap-5 md:gap-10 border-b border-line py-7 md:py-9 transition-colors"
          >
            {/* 호버 배경 슬라이드 */}
            <span className="absolute inset-0 bg-accent/[0.04] scale-x-0 origin-left transition-transform duration-500 group-hover:scale-x-100" />

            <span className="relative num text-small text-fg-mute w-8 shrink-0 group-hover:text-accent transition-colors">
              {w.index}
            </span>

            <div className="relative flex-1 min-w-0">
              <div className="flex items-baseline gap-3 flex-wrap">
                <h3 className="font-display text-fg text-[clamp(1.5rem,4vw,2.75rem)] tracking-tight transition-transform duration-300 group-hover:translate-x-2">
                  {w.title}
                </h3>
              </div>
              <p className="text-fg-dim text-small md:text-body mt-1.5 max-w-xl leading-relaxed">{w.blurb}</p>
            </div>

            <span className="relative grid place-items-center h-11 w-11 md:h-14 md:w-14 rounded-full border border-line text-fg-mute shrink-0 transition-all duration-300 group-hover:border-accent group-hover:text-accent group-hover:bg-accent/10 group-hover:rotate-[-45deg]">
              <ArrowRight size={20} />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ── 라이브 프리뷰 (실제 계절성 곡선) + 스탯 ── */
function LivePreview() {
  const stats = [
    { v: "15,788", l: "검색 종목" },
    { v: "41", l: "추적 펀드 (13F)" },
    { v: "2", l: "시장 · KR / US" },
    { v: "₩0", l: "운영비 · 서버리스" },
  ];
  return (
    <section className="max-w-7xl mx-auto px-5 md:px-10 pb-24 md:pb-32">
      <div className="text-center mb-10">
        <span className="num text-micro uppercase tracking-[0.2em] text-accent">Real Data</span>
        <h2 className="font-display text-fg text-[clamp(1.75rem,4vw,2.75rem)] tracking-tight mt-3">
          Analyze by Real Data
        </h2>
      </div>

      <div className="panel p-2 rounded-2xl">
        <div className="rounded-xl overflow-hidden">
          <HeroCurve />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
        {stats.map((s) => (
          <div key={s.l} className="panel px-5 py-5">
            <div className="num text-fg text-2xl md:text-[30px]">{s.v}</div>
            <div className="num text-micro uppercase tracking-[0.12em] text-fg-mute mt-1.5">{s.l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── 최종 CTA + 푸터 ── */
function FinalCta() {
  return (
    <section className="relative border-t border-line overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-80 aura pointer-events-none" />
      <div className="relative max-w-7xl mx-auto px-5 md:px-10 py-28 md:py-36 text-center">
        <h2 className="font-display text-fg text-[clamp(2.5rem,7vw,5rem)] tracking-[-0.03em] leading-[1.02]">
          Get Ready to Start.
        </h2>
        <div className="mt-10">
          <Link
            href="/chart"
            className="group inline-flex items-center gap-2.5 pl-8 pr-5 py-4 rounded-full bg-accent text-ink font-semibold text-[15px] transition-transform hover:scale-[1.03] active:scale-95"
          >
            Get started
            <span className="grid place-items-center h-7 w-7 rounded-full bg-ink/20 transition-transform group-hover:translate-x-0.5">
              <ArrowUpRight size={16} />
            </span>
          </Link>
        </div>

        <footer className="mt-28 pt-10 border-t border-line flex flex-col md:flex-row justify-between items-center gap-4 text-fg-mute text-small">
          <div className="flex items-center gap-2.5">
            <span className="grid place-items-center h-7 w-7 rounded-lg bg-accent/15 border border-accent/30 text-accent">
              <BrandGlyph />
            </span>
            <span className="font-display text-fg text-base">HighProfit</span>
          </div>
          <p className="max-w-md text-center md:text-right">
            HighProfit은 투자 참고용 보조 도구입니다. 모든 투자의 책임은 사용자 본인에게 있습니다.
          </p>
          <span className="num">© 2026 HighProfit</span>
        </footer>
      </div>
    </section>
  );
}
