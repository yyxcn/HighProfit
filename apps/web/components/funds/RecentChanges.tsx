"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { FundHolding, HoldingChange } from "@/lib/data";
import { pct } from "@/lib/format";
import { cn } from "@/lib/utils";

const BADGE: Record<Exclude<HoldingChange, "hold">, { label: string; cls: string }> = {
  new: { label: "신규", cls: "text-up border-up/40" },
  add: { label: "증가", cls: "text-up border-up/40" },
  reduce: { label: "감소", cls: "text-down border-down/40" },
  exit: { label: "전량", cls: "text-fg-mute border-line" },
};


/**
 * 해당 펀드의 최근 분기 변동 내역 (신규/증가/감소/전량).
 * 요약 카운트 + 비중 큰 순 리스트. 도넛 아래 좌측 칸에 표시.
 */
export function RecentChanges({ holding, limit = 8 }: { holding: FundHolding; limit?: number }) {
  const [expanded, setExpanded] = useState(false);
  // 다른 펀드 선택 시 접힌 상태로 초기화
  useEffect(() => setExpanded(false), [holding.cik, holding.quarter]);

  const changed = holding.positions.filter((p) => p.change !== "hold");
  if (changed.length === 0) {
    return <p className="text-small text-fg-mute">직전 분기 대비 변동 없음.</p>;
  }

  const count = (c: HoldingChange) => changed.filter((p) => p.change === c).length;
  const summary = [
    { c: "new" as const, n: count("new") },
    { c: "add" as const, n: count("add") },
    { c: "reduce" as const, n: count("reduce") },
    { c: "exit" as const, n: count("exit") },
  ].filter((s) => s.n > 0);

  // 청산은 weight 0 → 큰 변동을 위로: 보유분은 비중, 청산은 뒤로 밀되 |Δ| 로 정렬
  const rows = [...changed].sort((a, b) => {
    const aw = a.change === "exit" ? -1 : a.weight;
    const bw = b.change === "exit" ? -1 : b.weight;
    return bw - aw;
  });

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div className="text-small text-fg-dim">최근 변동</div>
        <div className="num text-micro text-fg-mute">{holding.quarter} vs 직전</div>
      </div>

      {/* 요약 카운트 */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {summary.map((s) => (
          <span
            key={s.c}
            className={cn("num text-micro px-1.5 py-0.5 rounded border", BADGE[s.c].cls)}
          >
            {BADGE[s.c].label} {s.n}
          </span>
        ))}
      </div>

      {/* 변동 리스트 */}
      <ul className="space-y-1">
        {(expanded ? rows : rows.slice(0, limit)).map((p) => (
          <li key={p.cusip} className="flex items-center gap-2 text-small">
            <span
              className={cn(
                "num text-micro px-1 py-0.5 rounded border shrink-0 w-9 text-center",
                BADGE[p.change as Exclude<HoldingChange, "hold">].cls
              )}
            >
              {BADGE[p.change as Exclude<HoldingChange, "hold">].label}
            </span>
            <span className="min-w-0 flex-1 truncate text-fg">{p.ticker ?? p.name}</span>
            {p.change === "exit" ? (
              <span className="text-down/80 shrink-0">매도</span>
            ) : (
              <span className="num text-fg-dim shrink-0">{pct(p.weight, 1, false)}</span>
            )}
          </li>
        ))}
      </ul>
      {rows.length > limit && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 mt-2 text-micro text-fg-mute hover:text-accent transition-colors"
        >
          <ChevronDown size={13} className={cn("transition-transform", expanded && "rotate-180")} />
          <span className="num">{expanded ? "접기" : `+${rows.length - limit}건 더`}</span>
        </button>
      )}
    </div>
  );
}
