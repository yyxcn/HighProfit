"use client";

import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { pct } from "@/lib/format";
import { useChartColors } from "@/lib/theme";

export function YearlyBars({ yearly }: { yearly: Record<string, number> }) {
  const cc = useChartColors();
  const data = Object.entries(yearly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, ret]) => ({ year, ret }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
        <XAxis dataKey="year" tick={{ fill: cc.axisText, fontSize: 11 }} stroke={cc.axis} />
        <YAxis tickFormatter={(v) => pct(v, 0, false)} tick={{ fill: cc.axisText, fontSize: 11 }} stroke={cc.axis} width={44} />
        <ReferenceLine y={0} stroke={cc.zero} />
        <Tooltip
          cursor={{ fill: cc.grid, opacity: 0.4 }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <div className="panel px-2.5 py-1.5 text-small num shadow-xl">
                <span className="text-fg-mute mr-2">{payload[0]!.payload.year}</span>
                <span className={payload[0]!.payload.ret >= 0 ? "text-up" : "text-down"}>
                  {pct(payload[0]!.payload.ret)}
                </span>
              </div>
            ) : null
          }
        />
        <Bar dataKey="ret" radius={[2, 2, 0, 0]} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.ret >= 0 ? cc.up : cc.down} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
