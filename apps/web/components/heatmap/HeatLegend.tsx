"use client";

import { CLAMP, heatColor, type Period } from "@highprofit/core";
import { pct } from "@/lib/format";

/** 기간별 클램핑 범위를 보여주는 색 범례. 같은 +5% 라도 1d 와 1y 의 색이 다른 이유가 여기 보인다. */
export function HeatLegend({ period }: { period: Period }) {
  const clamp = CLAMP[period];
  const stops = [-clamp, -clamp / 2, 0, clamp / 2, clamp];
  return (
    <div className="flex items-center gap-1.5">
      <span className="num text-micro text-fg-mute">{pct(-clamp, 0)}</span>
      <div className="flex h-3 rounded overflow-hidden border border-line">
        {stops.map((s, i) => (
          <span key={i} className="w-5 h-full block" style={{ background: heatColor(s, clamp) }} />
        ))}
      </div>
      <span className="num text-micro text-fg-mute">+{pct(clamp, 0, false)}</span>
    </div>
  );
}
