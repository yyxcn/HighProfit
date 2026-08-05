"use client";

import { useEffect, useRef, useState } from "react";
import { seasonality, type SeasonalPoint } from "@highprofit/core";
import { getBars } from "@/lib/data";
import { mmddToDoy, todayDoy } from "@/components/seasonality/SeasonalityChart";
import { pct } from "@/lib/format";
import { useChartColors } from "@/lib/theme";

const W = 1000;
const H = 260;
const PAD_Y = 28;
const THIS_YEAR = new Date().getFullYear();

// KOSPI 대표 경로. 프록시 우선순위(샘플/실데이터 모두 대응)
const CANDIDATES: [("KR" | "US"), string, string][] = [
  ["KR", "069500", "KOSPI"],
  ["KR", "005930", "삼성전자"],
];

export function HeroCurve() {
  const cc = useChartColors();
  const [points, setPoints] = useState<SeasonalPoint[] | null>(null);
  const [label, setLabel] = useState("KOSPI");
  const [failed, setFailed] = useState(false);
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      for (const [m, t, name] of CANDIDATES) {
        try {
          const bars = await getBars(m, t);
          if (!alive) return;
          const pts = seasonality(bars, THIS_YEAR - 10, THIS_YEAR);
          if (pts.length > 30) {
            setPoints(pts);
            setLabel(name);
            return;
          }
        } catch {
          /* 다음 후보 */
        }
      }
      if (alive) setFailed(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // stroke-dashoffset 시그니처 모션 (1.2s, 1→12월). reduced-motion 존중.
  useEffect(() => {
    const path = pathRef.current;
    if (!path || !points) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const len = path.getTotalLength();
    if (reduce) {
      path.style.strokeDasharray = "none";
      path.style.strokeDashoffset = "0";
      return;
    }
    path.style.strokeDasharray = `${len}`;
    path.style.strokeDashoffset = `${len}`;
    // 다음 프레임에 트랜지션 시작
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        path.style.transition = "stroke-dashoffset 1.2s ease-out";
        path.style.strokeDashoffset = "0";
      });
    });
  }, [points]);

  if (failed) {
    return (
      <div className="rounded-xl border border-line bg-surface h-64 flex items-center justify-center text-fg-mute text-small">
        계절성 데이터를 불러오지 못했습니다. 파이프라인 실행 후 다시 시도하세요.
      </div>
    );
  }
  if (!points) {
    return <div className="rounded-xl border border-line bg-surface h-64 animate-pulse" />;
  }

  const comps = points.map((p) => p.composite);
  const hi = Math.max(...comps, 0.001);
  const lo = Math.min(...comps, -0.001);
  const yOf = (v: number) => PAD_Y + (hi - v) / (hi - lo) * (H - 2 * PAD_Y);
  const xOf = (doy: number) => (doy / 365) * W;

  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(mmddToDoy(p.mmdd)).toFixed(1)} ${yOf(p.composite).toFixed(1)}`)
    .join(" ");
  const zeroY = yOf(0);
  const tx = xOf(todayDoy());
  const last = points[points.length - 1]!;

  const MONTHS = ["1월", "3월", "5월", "7월", "9월", "11월"];
  const MONTH_DOY = [1, 60, 121, 182, 244, 305];

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-baseline justify-between px-5 pt-4">
        <div className="text-small text-fg-dim tracking-tight">
          <span className="num text-accent">{label}</span> · 최근 10년 평균 경로
        </div>
        <div className="num text-small text-fg-dim">
          연말 <span className={last.composite >= 0 ? "text-up" : "text-down"}>{pct(last.composite)}</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-56">
        <defs>
          <linearGradient id="heroLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={cc.benchmark} />
            <stop offset="0.5" stopColor={cc.line} />
            <stop offset="1" stopColor={cc.accent} />
          </linearGradient>
        </defs>
        {/* 0 기준선 */}
        <line x1={0} x2={W} y1={zeroY} y2={zeroY} stroke={cc.grid} strokeWidth={1} />
        {/* 오늘 수직선 */}
        <line x1={tx} x2={tx} y1={PAD_Y - 8} y2={H - PAD_Y + 8} stroke={cc.accent} strokeWidth={1.5} strokeDasharray="3 3" />
        {/* 경로 */}
        <path
          ref={pathRef}
          d={d}
          fill="none"
          stroke="url(#heroLine)"
          strokeWidth={2.25}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="relative px-4 pb-3">
        <div className="flex justify-between text-micro text-fg-mute num">
          {MONTHS.map((m, i) => (
            <span key={m} style={{ position: "absolute", left: `${(MONTH_DOY[i]! / 365) * 100}%` }}>
              {m}
            </span>
          ))}
        </div>
        <div className="h-4" />
        <span
          className="absolute text-micro text-accent num"
          style={{ left: `calc(${(todayDoy() / 365) * 100}% )`, transform: "translateX(-50%)" }}
        >
          ▲ 오늘
        </span>
      </div>
    </div>
  );
}
