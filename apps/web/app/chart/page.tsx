"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import type { Bar, Market } from "@highprofit/core";
import { getBars } from "@/lib/data";
import { useUniverse } from "@/lib/universe";
import { kvGet, kvSet, DEFAULT_SMA, type SmaLine } from "@/lib/db";
import { MarketBadge } from "@/components/common/SecurityPicker";
import { PriceChart, type Preset } from "@/components/chart/PriceChart";
import { SmaPanel } from "@/components/chart/SmaPanel";
import { TradingViewChart } from "@/components/chart/TradingViewChart";
import { tvSymbol } from "@/lib/tvSymbol";
import { cn } from "@/lib/utils";

const PRESETS: Preset[] = ["1M", "3M", "6M", "1Y", "3Y", "5Y", "ALL"];
const PRESET_LABEL: Record<Preset, string> = {
  "1M": "1개월", "3M": "3개월", "6M": "6개월", "1Y": "1년", "3Y": "3년", "5Y": "5년", ALL: "전체",
};

type Mode = "tv" | "basic";

export default function ChartPage() {
  return (
    <Suspense fallback={<div className="p-6 text-fg-dim text-small">불러오는 중…</div>}>
      <ChartView />
    </Suspense>
  );
}

// 초기 화면 기본 종목 (URL 에 ?m=&t= 없을 때)
const DEFAULT_MARKET: Market = "US";
const DEFAULT_TICKER = "SPY";

function ChartView() {
  const params = useSearchParams();
  const market = (params.get("m") as Market) || DEFAULT_MARKET;
  const ticker = params.get("t") || DEFAULT_TICKER;
  const { items } = useUniverse();
  const meta = items.find((it) => it.m === market && it.t === ticker);

  const [mode, setMode] = useState<Mode>("tv");
  const [bars, setBars] = useState<Bar[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [preset, setPreset] = useState<Preset>("1Y");
  const [sma, setSma] = useState<SmaLine[]>(DEFAULT_SMA);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    kvGet<SmaLine[]>("chart.sma", DEFAULT_SMA).then(setSma);
  }, []);

  // 시장별 기본 모드: KRX 는 TV 무료 임베드가 라이선스로 막혀 있어 우리 데이터(기본),
  // 미국은 TV 임베드가 되므로 실시간(TV). (사용자가 토글로 바꿀 수 있음)
  useEffect(() => {
    setMode(market === "KR" ? "basic" : "tv");
  }, [market]);

  // 기본 모드에서만 우리 일봉 로드 (TV 모드는 위젯이 자체 데이터)
  useEffect(() => {
    if (mode !== "basic" || !market || !ticker) return;
    setStatus("loading");
    getBars(market, ticker)
      .then((b) => {
        setBars(b);
        setStatus("ok");
      })
      .catch(() => setStatus("error"));
  }, [market, ticker, mode]);

  const changeSma = (next: SmaLine[]) => {
    setSma(next);
    kvSet("chart.sma", next);
  };
  const changeMode = (m: Mode) => setMode(m);

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 + 컨트롤 */}
      <div className="shrink-0 flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-line">
        <div className="flex items-center gap-2">
          <span className="num text-fg-dim text-small">{ticker}</span>
          <span className="text-fg font-semibold">{meta?.n ?? ticker}</span>
          {market && <MarketBadge market={market} type={meta?.type} />}
        </div>

        {/* TradingView ↔ 기본 토글 */}
        <div className="inline-flex rounded-md border border-line bg-surface/60 p-0.5">
          <button
            onClick={() => changeMode("tv")}
            className={cn("text-small px-2.5 py-1 rounded transition-colors", mode === "tv" ? "bg-raised text-fg" : "text-fg-dim hover:text-fg")}
          >
            TradingView
          </button>
          <button
            onClick={() => changeMode("basic")}
            className={cn("text-small px-2.5 py-1 rounded transition-colors", mode === "basic" ? "bg-raised text-fg" : "text-fg-dim hover:text-fg")}
          >
            기본
          </button>
        </div>

        {mode === "basic" && (
          <div className="flex items-center gap-1 ml-auto">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={cn("num text-small px-2 py-1 rounded transition-colors", preset === p ? "bg-raised text-fg" : "text-fg-dim hover:text-fg")}
                title={PRESET_LABEL[p]}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setShowSettings((v) => !v)}
              className={cn("ml-1 p-1.5 rounded transition-colors", showSettings ? "bg-raised text-accent" : "text-fg-dim hover:text-fg")}
              aria-label="이동평균 설정"
            >
              <SlidersHorizontal size={16} />
            </button>
          </div>
        )}
      </div>

      {/* 차트 영역 */}
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 relative">
          {mode === "tv" && <TradingViewChart symbol={tvSymbol(market, ticker, meta?.e)} />}

          {mode === "basic" && (
            <>
              {status === "loading" && (
                <div className="absolute inset-0 flex items-center justify-center text-fg-dim text-small z-10">
                  <div className="animate-pulse">차트를 불러오는 중…</div>
                </div>
              )}
              {status === "error" && (
                <div className="absolute inset-0 flex items-center justify-center z-10">
                  <p className="text-fg-dim text-small text-center max-w-xs">
                    데이터를 불러오지 못했습니다. 실시간(TV)으로 보거나 다른 종목을 선택하세요.
                  </p>
                </div>
              )}
              {status === "ok" && bars.length > 0 && (
                <PriceChart bars={bars} smaLines={sma} preset={preset} currency={market} />
              )}
            </>
          )}
        </div>

        {mode === "basic" && showSettings && (
          <aside className="w-56 shrink-0 border-l border-line p-3 overflow-auto">
            <SmaPanel lines={sma} onChange={changeSma} />
          </aside>
        )}
      </div>
    </div>
  );
}
