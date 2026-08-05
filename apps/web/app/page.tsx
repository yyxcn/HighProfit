import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  CandlestickChart,
  Grid2x2,
  CalendarRange,
  History,
  Landmark,
} from "lucide-react";
import { HeroCurve } from "@/components/home/HeroCurve";

export default function Home() {
  return (
    <div className="px-5 md:px-10 pb-20 max-w-6xl mx-auto">
      {/* ── Hero ── */}
      <section className="pt-16 md:pt-20 pb-10 text-center fade-up">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-mint/25 bg-mint/5 mb-7">
          <span className="h-1.5 w-1.5 rounded-full bg-mint animate-pulse" />
          <span className="num text-micro tracking-[0.16em] uppercase text-mint">Institutional Grade · 15,000+ Securities</span>
        </div>
        <h1 className="font-display text-fg text-[clamp(2.75rem,7vw,4.5rem)] leading-[1.02] tracking-tight">
          숫자로 확인하고 <span className="text-accent italic">들어간다</span>
        </h1>
        <p className="text-fg-dim text-[16px] md:text-[18px] mt-5 max-w-2xl mx-auto leading-relaxed">
          계절성·백테스트·히트맵·13F. 서버 없이 브라우저에서 계산하는 개인용 정밀 분석 터미널.
          한국·미국 전 종목, 운영비 0원.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-9">
          <Link
            href="/chart"
            className="group relative inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-accent text-ink font-semibold text-sm overflow-hidden transition-transform hover:scale-[1.03] active:scale-95 w-full sm:w-auto justify-center"
          >
            <span className="relative z-10">차트 시작하기</span>
            <ArrowRight size={16} className="relative z-10" />
          </Link>
          <Link
            href="/heatmap"
            className="panel glow-hover inline-flex items-center gap-2 px-6 py-3.5 text-fg font-semibold text-sm w-full sm:w-auto justify-center"
          >
            히트맵 둘러보기
          </Link>
        </div>
      </section>

      {/* ── 플로팅 대시보드 (실제 계절성 곡선) ── */}
      <div className="fade-up" style={{ animationDelay: "0.1s" }}>
        <div className="panel p-2 rounded-2xl">
          <div className="rounded-xl overflow-hidden">
            <HeroCurve />
          </div>
        </div>
      </div>

      {/* ── 스탯 스트립 ── */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
        {[
          { v: "15,788", l: "검색 종목" },
          { v: "41", l: "추적 펀드 (13F)" },
          { v: "2", l: "시장 · KR / US" },
          { v: "₩0", l: "운영비 · 서버리스" },
        ].map((s, i) => (
          <div key={s.l} className="panel px-5 py-4 fade-up" style={{ animationDelay: `${0.15 + i * 0.04}s` }}>
            <div className="num text-fg text-2xl md:text-[28px]">{s.v}</div>
            <div className="num text-micro uppercase tracking-[0.12em] text-fg-mute mt-1">{s.l}</div>
          </div>
        ))}
      </section>

      {/* ── Core Capabilities (bento) ── */}
      <section className="mt-16">
        <div className="text-center mb-8">
          <h2 className="font-display text-fg text-[clamp(1.75rem,4vw,2.5rem)] tracking-tight">Core Capabilities</h2>
          <p className="text-fg-dim mt-2">개인 워크플로를 위한 정밀 도구.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Bento href="/chart" icon={CandlestickChart} title="차트" span2 badge="REAL-TIME">
            캔들 + 거래량 + 이동평균선. 상장 이후 전체 히스토리를 한 번에, 재요청 없는 기간 전환.
          </Bento>
          <Bento href="/heatmap" icon={Grid2x2} title="히트맵">
            섹터별 온도. 시총 면적 × 기간 수익률 트리맵으로 시장 전체를 한눈에.
          </Bento>
          <Bento href="/seasonality" icon={CalendarRange} title="계절성">
            10년 평균 경로. 통계적 유의성(t‑stat)까지 정직하게.
          </Bento>
          <Bento href="/backtest" icon={History} title="백테스팅" span2 metrics>
            20년 데이터로 포트폴리오를 검증. 리밸런싱·거래비용·MDD까지 반영.
          </Bento>
          <Bento href="/funds" icon={Landmark} title="펀드" span3>
            SEC 13F. 버크셔·시타델·르네상스 등 41개 유명 펀드의 보유·전분기 변화.
          </Bento>
        </div>
      </section>

      <footer className="mt-20 pt-20 border-t border-line flex flex-col md:flex-row justify-between items-start gap-4 text-fg-mute text-small">
        <div>
          <span className="font-display text-fg text-base">HighProfit</span>
          <p className="mt-1 max-w-sm"> 과거는 미래 수익을 보장하지 않습니다. 모든 투자 판단은 사용자에게 있습니다.</p>
        </div>
        <span className="num">© 2026 HighProfit</span>
      </footer>
    </div>
  );
}

function Bento({
  href,
  icon: Icon,
  title,
  children,
  span2,
  span3,
  badge,
  metrics,
}: {
  href: string;
  icon: typeof CandlestickChart;
  title: string;
  children: React.ReactNode;
  span2?: boolean;
  span3?: boolean;
  badge?: string;
  metrics?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`panel glow-hover group p-6 flex flex-col ${span3 ? "md:col-span-3" : span2 ? "md:col-span-2" : ""}`}
    >
      <div className="flex items-start justify-between">
        <span className="grid place-items-center h-10 w-10 rounded-xl bg-accent/10 border border-accent/20 text-accent group-hover:scale-110 transition-transform">
          <Icon size={20} strokeWidth={1.75} />
        </span>
        <div className="flex items-center gap-2">
          {badge && <span className="num text-micro px-2 py-0.5 rounded bg-mint/10 text-mint tracking-wide">{badge}</span>}
          <ArrowUpRight size={18} className="text-fg-mute group-hover:text-accent transition-colors" />
        </div>
      </div>
      <h3 className="font-display text-fg text-xl mt-5">{title}</h3>
      <p className="text-fg-dim text-small mt-2 leading-relaxed max-w-md">{children}</p>

      {metrics && (
        <div className="grid grid-cols-3 gap-2 mt-5">
          {[
            { l: "CAGR", v: "+14.2%", c: "text-up" },
            { l: "MDD", v: "-18.4%", c: "text-down" },
            { l: "Sharpe", v: "1.32", c: "text-accent" },
          ].map((m) => (
            <div key={m.l} className="rounded-lg border border-line px-3 py-2">
              <div className="num text-micro uppercase tracking-wide text-fg-mute">{m.l}</div>
              <div className={`num text-sm mt-0.5 ${m.c}`}>{m.v}</div>
            </div>
          ))}
        </div>
      )}
    </Link>
  );
}
