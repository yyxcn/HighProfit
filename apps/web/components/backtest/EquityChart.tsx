"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceArea,
  Legend,
} from "recharts";
import type { BacktestResult } from "@highprofit/core";
import { won, ymd, pct } from "@/lib/format";
import { useChartColors } from "@/lib/theme";

export function EquityChart({ result, benchLabel }: { result: BacktestResult; benchLabel?: string }) {
  const cc = useChartColors();
  const benchMap = new Map(result.benchmark?.map((b) => [b.date, b.value]));
  const data = result.equity.map((e) => ({
    date: e.date,
    strat: e.value,
    bench: benchMap.get(e.date) ?? null,
  }));
  const worst = result.drawdowns[0];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 8 }}>
        <CartesianGrid stroke={cc.grid} strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: cc.axisText, fontSize: 11 }}
          stroke={cc.axis}
          minTickGap={60}
          tickFormatter={(d: string) => d.slice(0, 4)}
        />
        <YAxis
          tick={{ fill: cc.axisText, fontSize: 11 }}
          stroke={cc.axis}
          width={64}
          tickFormatter={(v: number) => (v >= 1e8 ? `${(v / 1e8).toFixed(1)}억` : `${Math.round(v / 1e4)}만`)}
        />
        {worst && (
          <ReferenceArea x1={worst.start} x2={worst.end ?? worst.trough} fill={cc.down} fillOpacity={0.1} ifOverflow="visible" />
        )}
        <Tooltip content={<EqTooltip benchLabel={benchLabel} />} />
        <Legend wrapperStyle={{ fontSize: 11, color: cc.axisText }} formatter={(v) => (v === "strat" ? "전략" : benchLabel ?? "벤치마크")} />
        <Line type="monotone" dataKey="strat" stroke={cc.accent} strokeWidth={1.75} dot={false} isAnimationActive={false} />
        {result.benchmark && (
          <Line type="monotone" dataKey="bench" stroke={cc.benchmark} strokeWidth={1.25} strokeDasharray="4 3" dot={false} isAnimationActive={false} connectNulls />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

function EqTooltip({
  active,
  payload,
  label,
  benchLabel,
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number }[];
  label?: string;
  benchLabel?: string;
}) {
  if (!active || !payload?.length) return null;
  const strat = payload.find((p) => p.dataKey === "strat")?.value;
  const bench = payload.find((p) => p.dataKey === "bench")?.value;
  return (
    <div className="panel px-3 py-2 text-small num shadow-xl">
      <div className="text-fg-mute mb-1">{ymd(label)}</div>
      {strat != null && (
        <div className="flex justify-between gap-6">
          <span className="text-accent">전략</span>
          <span className="text-fg">{won(strat)}</span>
        </div>
      )}
      {bench != null && (
        <div className="flex justify-between gap-6">
          <span className="text-fg-dim">{benchLabel ?? "벤치마크"}</span>
          <span className="text-fg-dim">{won(bench)}</span>
        </div>
      )}
    </div>
  );
}

/** 연도별 수익률 → 표시용 배열 */
export function yearlyToRows(yearly: Record<string, number>) {
  return Object.entries(yearly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, ret]) => ({ year, ret, label: pct(ret) }));
}
