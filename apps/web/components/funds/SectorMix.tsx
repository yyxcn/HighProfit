"use client";

import { useMemo } from "react";
import type { FundHolding } from "@/lib/data";
import { useUniverse } from "@/lib/universe";
import { sectorLabel } from "@/lib/sectorLabel";
import { WeightBars } from "@/components/funds/WeightBars";
import { pct } from "@/lib/format";

/**
 * 보유 종목을 GICS 섹터로 묶은 비중 막대. "이 펀드가 어디에 베팅하는가" 를 한 줄씩 보여 준다.
 *
 * 섹터는 `universe.json` 의 `s` 에서 가져온다 — 화면이 이미 받아 둔 파일이라 추가 요청이 없다.
 * 13F 는 미국 롱 포지션만 담으므로 US 종목으로만 찾는다(KR 에 같은 티커가 있어도 섞이지 않게).
 */
const TOP_N = 7;

export function SectorMix({ holding }: { holding: FundHolding }) {
  const { items, loading } = useUniverse();

  const rows = useMemo(() => {
    const sectorOf = new Map<string, string>();
    for (const it of items) if (it.m === "US" && it.s) sectorOf.set(it.t, it.s);

    const held = holding.positions.filter((p) => p.weight > 0);
    const total = held.reduce((a, p) => a + p.weight, 0);
    if (total <= 0) return { unknown: 0, list: [] };

    const by = new Map<string, number>();
    for (const p of held) {
      // 티커를 못 붙였거나(CUSIP 매핑 실패), universe 에 없거나, yfinance 가 섹터를 안 준 종목(`기타`)
      // 은 모두 한 덩어리로 — 사용자에겐 다 "섹터를 모르는 종목"이다.
      const s = (p.ticker && sectorOf.get(p.ticker)) || "미분류";
      const key = s === "기타" ? "미분류" : s;
      by.set(key, (by.get(key) ?? 0) + p.weight);
    }

    const sorted = [...by].sort((a, b) => b[1] - a[1]);
    const head = sorted.slice(0, TOP_N);
    const tail = sorted.slice(TOP_N);
    const restWeight = tail.reduce((a, [, w]) => a + w, 0);
    // 잔여 묶음은 "기타" 라 부르지 않는다 — 위의 `미분류` 와 뜻이 겹쳐 읽는 사람이 헷갈린다.
    const list = restWeight > 0 ? [...head, [`그 외 ${tail.length}개 섹터`, restWeight] as const] : head;

    // 막대 길이는 전체 대비가 아니라 1위 대비 — 20% 짜리 1위도 칸을 꽉 채워 비교가 쉬워진다
    const max = list[0]?.[1] ?? 1;
    return {
      unknown: (by.get("미분류") ?? 0) / total,
      list: list.map(([name, w]) => ({
        name: sectorLabel(name),
        weight: w / total,
        bar: w / max,
      })),
    };
  }, [holding, items]);

  if (loading && rows.list.length === 0) {
    return <div className="h-24 rounded bg-raised/40 animate-pulse" />;
  }
  if (rows.list.length === 0) return null;

  return (
    <div>
      <div className="text-small text-fg-dim mb-2">섹터 구성</div>
      <WeightBars rows={rows.list} />
      {/* 미분류가 크면 구성 자체가 의미를 잃는다 — 왜 그런지 밝혀 두지 않으면 오해한다 */}
      {rows.unknown >= 0.2 && (
        <p className="mt-1.5 text-micro text-fg-mute leading-snug">
          섹터를 모르는 종목: {pct(rows.unknown, 0, false)}
        </p>
      )}
    </div>
  );
}
