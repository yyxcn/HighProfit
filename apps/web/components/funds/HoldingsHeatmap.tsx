"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import {
  PERIOD_LOOKBACK,
  heatColorFor,
  rangeReturn,
  type Bar,
  type Period,
} from "@highprofit/core";
import { getBars, type FundHolding, type FundPosition } from "@/lib/data";
import { Segment } from "@/components/common/Segment";
import { HeatLegend } from "@/components/heatmap/HeatLegend";
import { measure, fitText } from "@/lib/svgText";
import { pct, compact } from "@/lib/format";
import { useChartColors } from "@/lib/theme";

/**
 * 펀드 보유종목 히트맵. **면적 = 비중(평가액), 색 = 그 종목의 기간수익률**.
 *
 * 섹터 히트맵과 달리 사전집계본이 없다 — `sectors/US.json` 은 대형주 중심이라 13F 에 흔한
 * 중소형주가 통째로 빠진다. 그래서 종목별 parquet 를 직접 읽어 브라우저에서 계산한다.
 * 다만 종목당 ~100KB 라 **비중 0.5% 이상만** 대상으로 한다(꼬리 수십 종목까지 받으면 수십 MB).
 * 계산은 `@highprofit/core` 의 `rangeReturn` + `PERIOD_LOOKBACK` — 파이프라인과 같은 거래일 수라
 * 섹터 히트맵과 색이 어긋나지 않는다.
 */
const MIN_WEIGHT = 0.005;
const FETCH_CONCURRENCY = 8;
/** 펀드가 바뀐 직후 렌더용 빈 맵. 매 렌더 새로 만들면 useMemo 가 헛돈다. */
const EMPTY_BARS: Map<string, Bar[]> = new Map();

const PERIODS: { key: Period; label: string }[] = [
  { key: "1d", label: "1일" },
  { key: "5d", label: "5일" },
  { key: "1m", label: "1개월" },
  { key: "3m", label: "3개월" },
  { key: "6m", label: "6개월" },
  { key: "1y", label: "1년" },
];

interface Cell {
  ticker: string;
  name: string;
  weight: number;
  value: number;
  /** null = 시세를 못 받았거나 그 기간만큼의 데이터가 없음 (0% 와 구분해야 한다). */
  ret: number | null;
}
interface Drawn extends Cell {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  title: { text: string; fs: number } | null;
  retText: string | null;
}

export function HoldingsHeatmap({ holding }: { holding: FundHolding }) {
  const router = useRouter();
  const cc = useChartColors();
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [period, setPeriod] = useState<Period>("1m");
  const [tip, setTip] = useState<{ x: number; y: number; cell: Drawn } | null>(null);

  // 펀드를 바꾸면 이전 시세가 잠깐 남는다 — 상태를 지우는 대신 키 일치로 걸러낸다(FundDetail 과 같은 방식).
  const key = `${holding.cik}_${holding.quarter}`;
  const [prog, setProg] = useState<{ key: string; bars: Map<string, Bar[]>; loaded: number }>({
    key: "",
    bars: new Map(),
    loaded: 0,
  });
  const { bars, loaded } = prog.key === key ? prog : { bars: EMPTY_BARS, loaded: 0 };

  // 13F 는 미국 롱 포지션만 담는다 → 시장은 US 고정.
  // CUSIP→티커 매핑에 실패한 포지션은 시세를 찾을 길이 없어 제외한다.
  const targets = useMemo(
    () =>
      holding.positions.filter(
        (p): p is FundPosition & { ticker: string } => !!p.ticker && p.weight >= MIN_WEIGHT
      ),
    [holding]
  );

  useEffect(() => {
    let alive = true;
    const acc = new Map<string, Bar[]>();
    let next = 0;
    let done = 0;
    // 동시 요청을 제한한다 — 40종목을 한꺼번에 던지면 같은 정적 호스트에 순간 부하가 몰린다.
    // 받는 대로 반영해서 타일이 점진적으로 칠해지게 한다(전부 끝날 때까지 빈 화면을 보이지 않도록).
    const worker = async () => {
      for (;;) {
        const t = targets[next++];
        if (!t || !alive) return;
        try {
          acc.set(t.ticker, await getBars("US", t.ticker));
        } catch {
          // 상장폐지·티커 변경 등 — 그 타일만 회색으로 둔다
        }
        if (!alive) return;
        done++;
        setProg({ key, bars: new Map(acc), loaded: done });
      }
    };
    for (let i = 0; i < Math.min(FETCH_CONCURRENCY, targets.length); i++) void worker();
    return () => {
      alive = false;
    };
  }, [targets, key]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 웹폰트가 붙기 전 잰 글자 폭은 폴백 폰트 기준이라 어긋난다 → 로드되면 한 번 다시 맞춘다.
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    document.fonts?.ready.then(() => setFontsReady(true));
  }, []);

  const cells = useMemo(() => {
    if (size.w < 10 || size.h < 10 || targets.length === 0) return [] as Drawn[];
    const lookback = PERIOD_LOOKBACK[period];

    const children: Cell[] = targets.map((p) => {
      const b = bars.get(p.ticker);
      return {
        ticker: p.ticker,
        name: p.name,
        weight: p.weight,
        value: p.value,
        ret: b && b.length > lookback ? rangeReturn(b, lookback) : null,
      };
    });

    const root = hierarchy<{ children?: Cell[]; value?: number }>({ children })
      .sum((d) => (d as Cell).value ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    return treemap<{ children?: Cell[]; value?: number }>()
      .tile(treemapSquarify)
      .size([size.w, size.h])
      .paddingInner(1)(root)
      .leaves()
      .map((l): Drawn => {
        const c = l.data as Cell;
        const w = l.x1 - l.x0;
        const h = l.y1 - l.y0;
        const retText = c.ret === null ? "—" : pct(c.ret);
        const title = h > 20 ? fitText(c.ticker, w - 8, 13, 9) : null;
        const showRet = !!title && h > 34 && measure(retText, 10, 500, true) <= w - 6;
        return {
          ...c,
          x0: l.x0,
          y0: l.y0,
          x1: l.x1,
          y1: l.y1,
          title,
          retText: showRet ? retText : null,
        };
      });
    // fontsReady 는 값을 쓰진 않지만, 웹폰트가 붙은 뒤 글자 폭을 다시 재려면 필요한 의존성이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets, bars, period, size, fontsReady]);

  const hidden = holding.positions.length - targets.length;
  const pending = loaded < targets.length;

  if (targets.length === 0) {
    return (
      <p className="text-small text-fg-mute">
        비중 {pct(MIN_WEIGHT, 1, false)} 이상인 보유 종목이 없어 히트맵을 그릴 수 없습니다.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-small text-fg-dim mr-auto">
          보유 종목 히트맵{" "}
          <span className="text-fg-mute">
            — 면적 비중 · 색 수익률 (비중 {pct(MIN_WEIGHT, 1, false)} 이상 {targets.length}종목)
          </span>
        </div>
        <Segment
          options={PERIODS.map((p) => ({ key: p.key, label: p.label }))}
          value={period}
          onChange={(k) => setPeriod(k as Period)}
        />
        <HeatLegend period={period} />
      </div>

      <div ref={ref} className="relative w-full h-80">
        <svg width={size.w} height={size.h} className="block">
          {cells.map((c) => {
            const w = c.x1 - c.x0;
            const h = c.y1 - c.y0;
            const cy = c.y0 + h / 2;
            return (
              <g
                key={c.ticker}
                onMouseMove={(e) => {
                  const box = ref.current!.getBoundingClientRect();
                  setTip({ x: e.clientX - box.left, y: e.clientY - box.top, cell: c });
                }}
                onMouseLeave={() => setTip(null)}
                onClick={() => router.push(`/chart?m=US&t=${c.ticker}`)}
                className="cursor-pointer"
              >
                <rect
                  x={c.x0}
                  y={c.y0}
                  width={Math.max(0, w)}
                  height={Math.max(0, h)}
                  // 시세를 못 받은 타일은 0% 와 헷갈리지 않게 채도 없는 회색 + 반투명
                  fill={c.ret === null ? cc.zero : heatColorFor(c.ret, period)}
                  fillOpacity={c.ret === null ? 0.4 : 1}
                  stroke={cc.tileStroke}
                  strokeWidth={0.5}
                />
                {c.title && (
                  <text
                    x={c.x0 + w / 2}
                    y={cy - (c.retText ? 5 : -3)}
                    textAnchor="middle"
                    fontSize={c.title.fs}
                    fontWeight={700}
                    fill="#fff"
                    style={{ pointerEvents: "none" }}
                  >
                    {c.title.text}
                  </text>
                )}
                {c.retText && (
                  <text
                    x={c.x0 + w / 2}
                    y={cy + 10}
                    textAnchor="middle"
                    fontSize={10}
                    className="num"
                    fill="#fff"
                    fillOpacity={0.85}
                    style={{ pointerEvents: "none" }}
                  >
                    {c.retText}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {pending && (
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 px-2 py-1 text-micro text-fg-mute">
            <span className="num">
              시세 {loaded}/{targets.length}
            </span>
            <span className="h-0.5 flex-1 rounded bg-line overflow-hidden">
              <span
                className="block h-full bg-accent transition-[width] duration-200"
                style={{ width: `${(loaded / targets.length) * 100}%` }}
              />
            </span>
          </div>
        )}

        {tip && (
          <div
            className="absolute z-20 pointer-events-none rounded-lg border border-line bg-surface px-2.5 py-1.5 text-small shadow-xl"
            style={{ left: Math.min(tip.x + 12, Math.max(0, size.w - 200)), top: tip.y + 12 }}
          >
            <div className="text-fg">
              <span className="num text-fg-dim">{tip.cell.ticker}</span> {tip.cell.name}
            </div>
            <div className="flex justify-between gap-4 num">
              <span className="text-fg-mute">수익률</span>
              {tip.cell.ret === null ? (
                <span className="text-fg-mute">시세 없음</span>
              ) : (
                <span className={tip.cell.ret >= 0 ? "text-up" : "text-down"}>
                  {pct(tip.cell.ret)}
                </span>
              )}
            </div>
            <div className="flex justify-between gap-4 num">
              <span className="text-fg-mute">비중</span>
              <span className="text-fg-dim">{pct(tip.cell.weight, 1, false)}</span>
            </div>
            <div className="flex justify-between gap-4 num">
              <span className="text-fg-mute">평가액</span>
              <span className="text-fg-dim">${compact(tip.cell.value)}</span>
            </div>
          </div>
        )}
      </div>

      {hidden > 0 && (
        <p className="text-micro text-fg-mute">
          비중 {pct(MIN_WEIGHT, 1, false)} 미만·티커 미매핑 {hidden}종목은 제외했습니다. 수익률은
          공시 시점이 아니라 <b className="text-fg-dim">오늘 기준</b>이며, 펀드가 아직 들고 있다는
          보장은 없습니다(13F 45일 지연).
        </p>
      )}
    </div>
  );
}
