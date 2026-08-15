"use client";

import { useMemo } from "react";
import { capBand, type CapBand } from "@highprofit/core";
import type { FundHolding } from "@/lib/data";
import { useUniverse } from "@/lib/universe";
import { WeightBars, type WeightRow } from "@/components/funds/WeightBars";
import { pct } from "@/lib/format";

/**
 * 보유 종목의 시가총액 구간 분포. 섹터 구성이 "어디에" 라면 이건 "어느 크기에" 베팅하는가 —
 * 같은 가치투자라도 대형주 위주인지 소외된 중소형 위주인지가 여기서 갈린다.
 *
 * 시총은 `universe.json` 의 `c`(억 KRW), 구간 경계는 `@highprofit/core` 의 `capBand`.
 * 구간 순서는 큰 쪽부터 고정한다 — 비중순으로 섞으면 대/중/소가 뒤죽박죽이라 읽기 나쁘다.
 */
// `unknown` 은 막대로 그리지 않는다 — 아래 한 줄 안내와 같은 값이라 두 번 말하는 꼴이 된다.
const ORDER: { band: Exclude<CapBand, "unknown">; label: string }[] = [
  { band: "large", label: "대형주 ($10B+)" },
  { band: "mid", label: "중형주 ($2–10B)" },
  { band: "small", label: "소형주 (<$2B)" },
];

export function CapMix({ holding }: { holding: FundHolding }) {
  const { items, loading } = useUniverse();

  const { rows, unknown } = useMemo(() => {
    const capOf = new Map<string, number>();
    for (const it of items) if (it.m === "US") capOf.set(it.t, it.c);

    const held = holding.positions.filter((p) => p.weight > 0);
    const total = held.reduce((a, p) => a + p.weight, 0);
    if (total <= 0) return { rows: [] as WeightRow[], unknown: 0 };

    const by = new Map<CapBand, number>();
    for (const p of held) {
      const b = capBand(p.ticker ? capOf.get(p.ticker) : null);
      by.set(b, (by.get(b) ?? 0) + p.weight);
    }

    const present = ORDER.filter((o) => (by.get(o.band) ?? 0) > 0);
    const max = Math.max(...present.map((o) => by.get(o.band) ?? 0), 0);
    return {
      unknown: (by.get("unknown") ?? 0) / total,
      rows: present.map((o) => {
        const w = by.get(o.band) ?? 0;
        return { name: o.label, weight: w / total, bar: max > 0 ? w / max : 0 };
      }),
    };
  }, [holding, items]);

  if (loading && rows.length === 0) {
    return <div className="h-16 rounded bg-raised/40 animate-pulse" />;
  }
  if (rows.length === 0 && unknown <= 0) return null;

  return (
    <div>
      <div className="text-small text-fg-dim mb-2">시가총액 구간</div>
      <WeightBars rows={rows} />
      {/* 미상은 막대에서 뺐으므로 조금이라도 있으면 늘 밝힌다 — 안 그러면 합이 100% 가 아닌 이유가 없다 */}
      {unknown > 0 && (
        <p className="mt-1.5 text-micro text-fg-mute leading-snug">
          시총을 못 받은 종목: {pct(unknown, 0, false)}
        </p>
      )}
    </div>
  );
}
