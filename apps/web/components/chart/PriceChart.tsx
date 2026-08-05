"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { sma, type Bar } from "@highprofit/core";
import type { SmaLine } from "@/lib/db";
import { pct } from "@/lib/format";
import { useChartColors } from "@/lib/theme";

export type Preset = "1M" | "3M" | "6M" | "1Y" | "3Y" | "5Y" | "ALL";
const PRESET_DAYS: Record<Preset, number> = {
  "1M": 21, "3M": 63, "6M": 126, "1Y": 252, "3Y": 756, "5Y": 1260, ALL: Infinity,
};

interface Hover {
  date: string;
  o: number; h: number; l: number; c: number; v: number;
  chg: number | null;
}

export function PriceChart({
  bars,
  smaLines,
  preset,
  currency,
}: {
  bars: Bar[];
  smaLines: SmaLine[];
  preset: Preset;
  currency: "KR" | "US";
}) {
  const cc = useChartColors();
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const smaRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const [hover, setHover] = useState<Hover | null>(null);

  // 차트 1회 생성
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { color: "transparent" },
        textColor: cc.axisText,
        fontFamily: "var(--font-jetbrains), monospace",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: cc.grid, style: 1 },
        horzLines: { color: cc.grid, style: 1 },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: cc.axisText, labelBackgroundColor: cc.grid },
        horzLine: { color: cc.axisText, labelBackgroundColor: cc.grid },
      },
      rightPriceScale: { borderColor: cc.grid },
      timeScale: { borderColor: cc.grid, rightOffset: 4 },
      autoSize: true,
    });
    chartRef.current = chart;

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: cc.up, downColor: cc.down,
      wickUpColor: cc.up, wickDownColor: cc.down,
      borderVisible: false,
    });
    candleRef.current = candle;

    const volume = chart.addSeries(
      HistogramSeries,
      { priceFormat: { type: "volume" }, priceScaleId: "" },
      1 // 별도 pane
    );
    volume.priceScale().applyOptions({ scaleMargins: { top: 0, bottom: 0 } });
    volumeRef.current = volume;

    // pane 높이비 3:1 (명세 6-1)
    const panes = chart.panes();
    if (panes[0]) panes[0].setStretchFactor(3);
    if (panes[1]) panes[1].setStretchFactor(1);

    const onMove = (param: Parameters<Parameters<IChartApi["subscribeCrosshairMove"]>[0]>[0]) => {
      const c = candleRef.current;
      if (!c || param.time === undefined || !param.seriesData.has(c)) {
        setHover(null);
        return;
      }
      const d = param.seriesData.get(c) as { open: number; high: number; low: number; close: number };
      const v = volumeRef.current ? (param.seriesData.get(volumeRef.current) as { value: number } | undefined) : undefined;
      setHover({
        date: String(param.time),
        o: d.open, h: d.high, l: d.low, c: d.close,
        v: v?.value ?? 0,
        chg: null,
      });
    };
    chart.subscribeCrosshairMove(onMove);

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      smaRef.current.clear();
    };
  }, []);

  // 데이터 갱신
  useEffect(() => {
    const candle = candleRef.current;
    const volume = volumeRef.current;
    if (!candle || !volume || bars.length === 0) return;

    candle.setData(
      bars.map((b) => ({ time: b.date as unknown as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close }))
    );
    volume.setData(
      bars.map((b, i) => {
        const up = i === 0 || b.close >= bars[i - 1]!.close;
        return {
          time: b.date as unknown as UTCTimestamp,
          value: b.volume,
          color: (up ? cc.up : cc.down) + "4D", // 30% 투명도
        };
      })
    );
  }, [bars, cc]);

  // 테마 전환 시 색 재적용
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({
      layout: { textColor: cc.axisText },
      grid: { vertLines: { color: cc.grid }, horzLines: { color: cc.grid } },
      crosshair: {
        vertLine: { color: cc.axisText, labelBackgroundColor: cc.grid },
        horzLine: { color: cc.axisText, labelBackgroundColor: cc.grid },
      },
      rightPriceScale: { borderColor: cc.grid },
      timeScale: { borderColor: cc.grid },
    });
    candleRef.current?.applyOptions({ upColor: cc.up, downColor: cc.down, wickUpColor: cc.up, wickDownColor: cc.down });
  }, [cc]);

  // SMA 라인 동기화
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || bars.length === 0) return;
    const closes = bars.map((b) => b.close);
    const existing = smaRef.current;
    const wanted = new Set(smaLines.filter((s) => s.visible).map((s) => s.id));

    // 제거
    for (const [id, series] of existing) {
      if (!wanted.has(id)) {
        chart.removeSeries(series);
        existing.delete(id);
      }
    }
    // 추가/갱신
    for (const s of smaLines) {
      if (!s.visible) continue;
      let series = existing.get(s.id);
      if (!series) {
        series = chart.addSeries(LineSeries, {
          color: s.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        });
        existing.set(s.id, series);
      } else {
        series.applyOptions({ color: s.color });
      }
      const vals = sma(closes, s.period);
      series.setData(
        bars
          .map((b, i) => ({ time: b.date as unknown as UTCTimestamp, value: vals[i] }))
          .filter((p) => p.value != null) as { time: UTCTimestamp; value: number }[]
      );
    }
  }, [smaLines, bars]);

  // 기간 프리셋 → setVisibleRange (재요청 없음)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || bars.length === 0) return;
    const ts = chart.timeScale();
    const days = PRESET_DAYS[preset];
    if (!isFinite(days) || days >= bars.length) {
      ts.fitContent();
      return;
    }
    const from = bars[Math.max(0, bars.length - days)]!.date;
    const to = bars[bars.length - 1]!.date;
    ts.setVisibleRange({ from: from as unknown as UTCTimestamp, to: to as unknown as UTCTimestamp });
  }, [preset, bars]);

  const last = bars[bars.length - 1];
  const shown = hover ?? (last ? { date: last.date, o: last.open, h: last.high, l: last.low, c: last.close, v: last.volume, chg: null } : null);
  const chg =
    shown && bars.length > 1
      ? (() => {
          const idx = bars.findIndex((b) => b.date === shown.date);
          if (idx <= 0) return null;
          return shown.c / bars[idx - 1]!.close - 1;
        })()
      : null;

  return (
    <div className="relative w-full h-full">
      {shown && (
        <div className="absolute z-10 top-2 left-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-small num pointer-events-none">
          <span className="text-fg-dim">{shown.date}</span>
          <Legend label="시" v={shown.o} cur={currency} />
          <Legend label="고" v={shown.h} cur={currency} />
          <Legend label="저" v={shown.l} cur={currency} />
          <Legend label="종" v={shown.c} cur={currency} />
          {chg != null && (
            <span className={chg > 0 ? "text-up" : chg < 0 ? "text-down" : "text-fg-dim"}>
              {pct(chg)}
            </span>
          )}
          <span className="text-fg-mute">거래량 {shown.v.toLocaleString()}</span>
        </div>
      )}
      <div ref={elRef} className="w-full h-full" />
    </div>
  );
}

function Legend({ label, v, cur }: { label: string; v: number; cur: "KR" | "US" }) {
  const s = cur === "KR" ? Math.round(v).toLocaleString() : v.toFixed(2);
  return (
    <span className="text-fg-dim">
      <span className="text-fg-mute">{label}</span> {s}
    </span>
  );
}
