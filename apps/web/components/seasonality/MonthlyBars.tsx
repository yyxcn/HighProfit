"use client";

import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import type { MonthlyPoint } from "@highprofit/core";
import { pct } from "@/lib/format";
import { useChartColors } from "@/lib/theme";

const MONTHS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

/** 월별 평균수익률. |tStat|<2 는 회색(노이즈) — 정직성 요구사항(명세 6-3). */
export function MonthlyBars({ data }: { data: MonthlyPoint[] }) {
  const cc = useChartColors();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
        <XAxis dataKey="month" tickFormatter={(m) => MONTHS[m - 1] ?? ""} tick={{ fill: cc.axisText, fontSize: 11 }} stroke={cc.axis} />
        <YAxis tickFormatter={(v) => pct(v, 0, false)} tick={{ fill: cc.axisText, fontSize: 11 }} stroke={cc.axis} width={44} />
        <ReferenceLine y={0} stroke={cc.zero} />
        <Tooltip content={<MonthTooltip />} cursor={{ fill: cc.grid, opacity: 0.4 }} />
        <Bar dataKey="avg" isAnimationActive={false} radius={[2, 2, 0, 0]}>
          {data.map((d, i) => {
            const significant = Math.abs(d.tStat) >= 2;
            const color = !significant ? "#6b7280" : d.avg >= 0 ? cc.up : cc.down;
            return <Cell key={i} fill={color} fillOpacity={significant ? 1 : 0.5} />;
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function MonthTooltip({ active, payload }: { active?: boolean; payload?: { payload: MonthlyPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]!.payload;
  const significant = Math.abs(p.tStat) >= 2;
  return (
    <div className="panel px-3 py-2 text-small num shadow-xl">
      <div className="text-fg mb-1">{p.month}월</div>
      <div className="flex justify-between gap-6">
        <span className="text-fg-mute">평균</span>
        <span className={p.avg >= 0 ? "text-up" : "text-down"}>{pct(p.avg)}</span>
      </div>
      <div className="flex justify-between gap-6">
        <span className="text-fg-mute">표본</span>
        <span className="text-fg-dim">{p.n}년</span>
      </div>
      <div className="flex justify-between gap-6">
        <span className="text-fg-mute">유의성</span>
        <span className={significant ? "text-fg" : "text-fg-mute"}>
          t={p.tStat.toFixed(1)} {significant ? "" : "(약함)"}
        </span>
      </div>
    </div>
  );
}
