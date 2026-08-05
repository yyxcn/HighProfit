"use client";

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { SeasonalPoint } from "@highprofit/core";
import { pct, mmddKo } from "@/lib/format";
import { useChartColors } from "@/lib/theme";

const MONTH_TICKS = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
const MONTHS = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

/** 'MM-DD' → 2001년(비윤년) 기준 연중 일수 1..365 */
export function mmddToDoy(mmdd: string): number {
  const [m, d] = mmdd.split("-").map(Number);
  return Math.round((Date.UTC(2001, m! - 1, d!) - Date.UTC(2001, 0, 1)) / 86400000) + 1;
}

export function todayDoy(): number {
  const now = new Date();
  return Math.round((Date.UTC(2001, now.getMonth(), now.getDate()) - Date.UTC(2001, 0, 1)) / 86400000) + 1;
}

interface Row extends SeasonalPoint {
  doy: number;
  actual?: number | null;
}

export function SeasonalityChart({
  points,
  actual,
}: {
  points: SeasonalPoint[];
  actual?: Map<string, number> | null;
}) {
  const cc = useChartColors();
  const data: Row[] = points.map((p) => ({
    ...p,
    doy: mmddToDoy(p.mmdd),
    actual: actual?.get(p.mmdd) ?? null,
  }));

  const comps = data.map((d) => d.composite);
  const hi = Math.max(...comps, 0);
  const lo = Math.min(...comps, 0);
  const offset = hi === lo ? 0.5 : hi / (hi - lo);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
        <defs>
          <linearGradient id="compFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset={0} stopColor={cc.up} stopOpacity={0.35} />
            <stop offset={offset} stopColor={cc.up} stopOpacity={0.05} />
            <stop offset={offset} stopColor={cc.down} stopOpacity={0.05} />
            <stop offset={1} stopColor={cc.down} stopOpacity={0.35} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={cc.grid} strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="doy"
          type="number"
          domain={[1, 365]}
          ticks={MONTH_TICKS}
          tickFormatter={(d) => MONTHS[MONTH_TICKS.indexOf(d)] ?? ""}
          tick={{ fill: cc.axisText, fontSize: 11 }}
          stroke={cc.axis}
        />
        <YAxis
          tickFormatter={(v) => pct(v, 0, false)}
          tick={{ fill: cc.axisText, fontSize: 11 }}
          stroke={cc.axis}
          width={44}
        />
        <ReferenceLine y={0} stroke={cc.zero} strokeWidth={1} />
        <Area
          type="monotone"
          dataKey="composite"
          stroke={cc.line}
          strokeWidth={1.5}
          fill="url(#compFill)"
          isAnimationActive={false}
          dot={false}
        />
        {actual && (
          <Line
            type="monotone"
            dataKey="actual"
            stroke={cc.accent}
            strokeWidth={1.25}
            strokeOpacity={0.75}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
        )}
        <Tooltip content={<SeasonalTooltip />} cursor={{ stroke: cc.zero, strokeDasharray: "3 3" }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function SeasonalTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]!.payload;
  return (
    <div className="panel px-3 py-2 text-small num shadow-xl">
      <div className="text-fg mb-1">{mmddKo(p.mmdd)}</div>
      <Row2 label="평균" value={pct(p.avg)} color={p.avg >= 0 ? "text-up" : "text-down"} />
      <Row2 label="최대" value={pct(p.max)} color="text-up" />
      <Row2 label="최소" value={pct(p.min)} color="text-down" />
      <Row2 label="승률" value={`${Math.round(p.winRate * 100)}%`} />
      <Row2 label="표본" value={`${p.n}년`} />
      {p.actual != null && <Row2 label="올해" value={pct(p.actual)} color="text-accent" />}
    </div>
  );
}

function Row2({ label, value, color = "text-fg-dim" }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between gap-6">
      <span className="text-fg-mute">{label}</span>
      <span className={color}>{value}</span>
    </div>
  );
}
