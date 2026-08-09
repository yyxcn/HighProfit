"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarRange, TrendingUp, TrendingDown, ShieldCheck, Target } from "lucide-react";
import {
  seasonality,
  monthlySeasonality,
  monthlyReturnMatrix,
  type Bar,
  type UniverseItem,
} from "@highprofit/core";
import { getBars } from "@/lib/data";
import { SecurityButton } from "@/components/common/SecurityButton";
import { EmptyState } from "@/components/common/EmptyState";
import { SeasonalityChart } from "@/components/seasonality/SeasonalityChart";
import { MonthlyBars } from "@/components/seasonality/MonthlyBars";
import { ReliabilityGauge } from "@/components/seasonality/ReliabilityGauge";
import { MonthlyMatrix } from "@/components/seasonality/MonthlyMatrix";
import { pct, dirClass } from "@/lib/format";

const THIS_YEAR = new Date().getFullYear();
const PRESETS = [
  { label: "5Y", years: 5 },
  { label: "10Y", years: 10 },
  { label: "MAX", years: THIS_YEAR - 1990 },
] as const;

export default function SeasonalityPage() {
  const [sec, setSec] = useState<UniverseItem | null>(null);
  const [bars, setBars] = useState<Bar[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [fromYear, setFromYear] = useState(THIS_YEAR - 10);
  const [toYear, setToYear] = useState(THIS_YEAR);
  const [showActual, setShowActual] = useState(true);

  useEffect(() => {
    if (!sec) return;
    setStatus("loading");
    getBars(sec.m, sec.t)
      .then((b) => {
        setBars(b);
        setStatus("ok");
      })
      .catch(() => setStatus("error"));
  }, [sec]);

  const points = useMemo(
    () => (bars.length ? seasonality(bars, fromYear, toYear) : []),
    [bars, fromYear, toYear]
  );
  const monthly = useMemo(
    () => (bars.length ? monthlySeasonality(bars, fromYear, toYear) : []),
    [bars, fromYear, toYear]
  );
  const matrix = useMemo(
    () => (bars.length ? monthlyReturnMatrix(bars, fromYear, toYear) : []),
    [bars, fromYear, toYear]
  );

  // 올해 실제 경로 (1/1 기준 누적)
  const actual = useMemo(() => {
    if (!showActual || !bars.length) return null;
    const rows = bars.filter((b) => +b.date.slice(0, 4) === THIS_YEAR);
    if (rows.length < 2) return null;
    const base = rows[0]!.close;
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.date.slice(5), r.close / base - 1);
    return m;
  }, [bars, showActual]);

  const span = toYear - fromYear + 1;

  // 파생 지표 (정직 근거: n>0 인 달만, 유의성은 |t|≥2)
  const yearEnd = points.length ? points[points.length - 1]!.composite : null;
  const significant = monthly.filter((m) => m.n > 0 && Math.abs(m.tStat) >= 2).length;
  const valid = monthly.filter((m) => m.n > 0);
  const best = valid.reduce<null | (typeof valid)[number]>((a, m) => (!a || m.avg > a.avg ? m : a), null);
  const worst = valid.reduce<null | (typeof valid)[number]>((a, m) => (!a || m.avg < a.avg ? m : a), null);
  const totals = matrix.map((r) => r.total).filter((t): t is number => t != null);
  const winYears = totals.filter((t) => t > 0).length;

  const activePreset = PRESETS.find((p) => THIS_YEAR - p.years === fromYear && toYear === THIS_YEAR)?.label;
  const setPreset = (years: number) => {
    setFromYear(THIS_YEAR - years);
    setToYear(THIS_YEAR);
  };

  const ready = sec && status === "ok" && points.length > 0;
  // 종목이 바뀌면 차트를 새로 마운트해 인트로 애니메이션을 다시 재생한다.
  // (캐시된 종목은 로딩 프레임 없이 바로 그려져서 마운트만으론 트리거가 안 걸림)
  const introKey = sec ? `${sec.m}:${sec.t}` : "";

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* ── 헤더 ── */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 mb-2">
            <span className="px-2 py-0.5 rounded-full border border-accent/30 bg-accent/10 text-accent text-micro uppercase tracking-wider">
              계절성
            </span>
            <span className="text-small text-fg-mute">기간 분석 · 과거 평균</span>
          </div>
          <h1 className="font-display text-h1 text-fg truncate">
            {sec && <span className="text-fg-dim"> {sec.n}</span>}
          </h1>
          <p className="text-small text-fg-dim mt-1.5 max-w-xl leading-relaxed">
            연간 누적 경로를 기하평균으로 재구성해 반복되는 시기별 패턴을 봅니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <SecurityButton value={sec} onSelect={setSec} placeholder="종목 검색 (주식·ETF)" />
          <div className="flex rounded-lg border border-line bg-surface/60 p-0.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => setPreset(p.years)}
                className={
                  "px-3 py-1.5 rounded-md text-small font-medium transition-colors " +
                  (activePreset === p.label
                    ? "bg-raised text-accent"
                    : "text-fg-mute hover:text-fg")
                }
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-small">
            <YearInput value={fromYear} onChange={setFromYear} min={1990} max={toYear} />
            <span className="text-fg-mute">~</span>
            <YearInput value={toYear} onChange={setToYear} min={fromYear} max={THIS_YEAR} />
            <span className="text-fg-mute ml-0.5">({span}년)</span>
          </div>
          <label className="flex items-center gap-1.5 text-small text-fg-dim cursor-pointer">
            <input
              type="checkbox"
              checked={showActual}
              onChange={(e) => setShowActual(e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
            올해 경로
          </label>
        </div>
      </div>

      {span < 5 && sec && (
        <p className="text-small text-accent/90">
          표본 기간이 {span}년으로 짧습니다. 일별 평균의 신뢰도가 낮아지니 참고만 하세요.
        </p>
      )}

      {!sec && (
        <EmptyState icon={CalendarRange} title="종목을 검색해 10년 평균 경로를 확인하세요." />
      )}

      {sec && status === "error" && (
        <p className="text-fg-dim text-small">데이터를 불러오지 못했습니다. 다른 종목을 선택하세요.</p>
      )}

      {sec && status === "loading" && (
        <div className="h-[520px] rounded-[var(--radius)] border border-line bg-surface/40 animate-pulse" />
      )}

      {ready && (
        <>
          {/* ── 벤토: 메인 차트 + 사이드 지표 ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* 메인 차트 */}
            <div className="panel p-5 lg:col-span-8 flex flex-col">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="text-micro uppercase tracking-wider text-fg-mute mb-1">
                    평균 누적 경로 · 연말
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className={`num text-[30px] leading-none ${dirClass(yearEnd ?? 0)}`}>
                      {pct(yearEnd)}
                    </span>
                    <span className="text-small text-fg-mute">
                      1/1 → 12/31 · {span}년 기하평균
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 text-small text-fg-mute">
                  <Legend swatch="var(--color-fg)" label="평균 경로" />
                  {actual && <Legend swatch="var(--color-accent)" label="올해 경로" />}
                </div>
              </div>
              <div className="h-[360px]">
                <SeasonalityChart key={introKey} points={points} actual={actual} />
              </div>
            </div>

            {/* 사이드 지표 */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              <div className="panel p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-small font-medium text-fg-dim">패턴 신뢰도</h3>
                  <ShieldCheck size={16} className="text-accent" />
                </div>
                <ReliabilityGauge key={introKey} significant={significant} />
              </div>

              <div className="panel p-5 flex-1">
                <h3 className="text-micro uppercase tracking-wider text-fg-mute mb-4">계절 통계</h3>
                <div className="space-y-3.5">
                  {best && (
                    <StatRow
                      icon={<TrendingUp size={16} className="text-up" />}
                      title={`최고의 달 · ${best.month}월`}
                      value={pct(best.avg)}
                      valueClass={dirClass(best.avg)}
                    />
                  )}
                  {worst && (
                    <StatRow
                      icon={<TrendingDown size={16} className="text-down" />}
                      title={`최악의 달 · ${worst.month}월`}
                      value={pct(worst.avg)}
                      valueClass={dirClass(worst.avg)}
                    />
                  )}
                  <StatRow
                    icon={<Target size={16} className="text-accent" />}
                    title="연간 승률"
                    value={totals.length ? `${winYears}/${totals.length}년` : "—"}
                    valueClass="text-fg"
                  />
                </div>

                <div className="mt-5">
                  <div className="text-micro text-fg-mute mb-1.5">
                    월별 평균 <span className="text-fg-mute/70">(회색 = |t|&lt;2, 약함)</span>
                  </div>
                  <div className="h-28">
                    <MonthlyBars key={introKey} data={monthly} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── 연도별 월간 수익률 매트릭스 ── */}
          <div className="panel overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-line">
              <h3 className="text-small font-medium text-fg-dim">연도별 월간 수익률</h3>
              <span className="text-micro text-fg-mute">색 진하기 = 수익률 크기 · 초록/빨강 = 손익</span>
            </div>
            <MonthlyMatrix rows={matrix} />
          </div>

          <p className="text-micro text-fg-mute leading-relaxed">
            과거 평균이며 미래 수익을 보장하지 않습니다. 한국 시장은 설날·추석이 음력이라 해당 구간
            표본 수가 해마다 달라집니다 — 툴팁의 표본(n)을 함께 확인하세요.
          </p>
        </>
      )}
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: swatch }} />
      {label}
    </div>
  );
}

function StatRow({
  icon,
  title,
  value,
  valueClass,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid place-items-center h-9 w-9 shrink-0 rounded-lg bg-raised border border-line">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-small text-fg-dim truncate">{title}</div>
      </div>
      <div className={`num text-body ${valueClass}`}>{value}</div>
    </div>
  );
}

function YearInput({
  value,
  onChange,
  min,
  max,
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => {
        const n = +e.target.value;
        if (n >= min && n <= max) onChange(n);
      }}
      className="num w-[70px] bg-raised border border-line rounded px-2 py-1.5 text-fg outline-none focus:border-accent"
    />
  );
}
