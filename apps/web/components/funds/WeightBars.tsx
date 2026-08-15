"use client";

import { pct } from "@/lib/format";

export interface WeightRow {
  name: string;
  /** 0~1, 전체 대비 비중 */
  weight: number;
  /** 0~1, 막대 길이 (1위 대비) */
  bar: number;
}

/**
 * 라벨 + 비중 막대 리스트. 좁은 사이드 칸에서 쓰려고 막대를 배경으로 깔고 글자를 그 위에 얹는다
 * (라벨/막대를 두 줄로 쓰면 항목 하나가 두 배로 길어진다).
 * 막대 길이는 전체 대비가 아니라 **1위 대비** — 최상위가 20% 대인 분산형도 칸을 채워 비교가 쉽다.
 */
export function WeightBars({ rows }: { rows: WeightRow[] }) {
  return (
    <ul className="space-y-1">
      {rows.map((r) => (
        <li key={r.name} className="relative h-5 rounded overflow-hidden bg-raised/40">
          <div
            className="absolute inset-y-0 left-0 bg-accent/25"
            style={{ width: `${r.bar * 100}%` }}
          />
          <div className="relative flex h-full items-center justify-between gap-2 px-1.5">
            <span className="truncate text-micro text-fg" title={r.name}>
              {r.name}
            </span>
            <span className="num shrink-0 text-micro text-fg-dim">{pct(r.weight, 1, false)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
