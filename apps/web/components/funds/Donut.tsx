"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { FundPosition } from "@/lib/data";
import { pct } from "@/lib/format";
import { useChartColors } from "@/lib/theme";

const COLORS = ["#adc6ff", "#7aa2f7", "#9b8cff", "#c58af9", "#f78ac0", "#4edea3", "#5ec8d8", "#e0af68", "#e8875a", "#8b90a0"];

/** 상위 10 + 기타 도넛 (명세 6-5). */
export function Donut({ positions }: { positions: FundPosition[] }) {
  const cc = useChartColors();
  const held = positions.filter((p) => p.change !== "exit" && p.weight > 0);
  const top = held.slice(0, 10);
  const restWeight = held.slice(10).reduce((a, p) => a + p.weight, 0);
  const data = [
    ...top.map((p) => ({ name: p.ticker ?? p.name, weight: p.weight })),
    ...(restWeight > 0 ? [{ name: "기타", weight: restWeight }] : []),
  ];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="weight" nameKey="name" cx="50%" cy="50%" innerRadius="58%" outerRadius="82%" stroke={cc.tileStroke} strokeWidth={1.5} isAnimationActive={false}>
          {data.map((_, i) => (
            <Cell key={i} fill={i === data.length - 1 && restWeight > 0 ? "#6b7280" : COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          content={({ active, payload }) =>
            active && payload?.length ? (
              <div className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-small num shadow-xl">
                <span className="text-fg mr-2">{payload[0]!.name}</span>
                <span className="text-accent">{pct(payload[0]!.value as number)}</span>
              </div>
            ) : null
          }
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
