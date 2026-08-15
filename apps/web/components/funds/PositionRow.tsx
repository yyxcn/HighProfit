"use client";

import type { FundPosition, HoldingChange } from "@/lib/data";
import { pct, compact } from "@/lib/format";
import { cn } from "@/lib/utils";

/** 보유 종목 한 줄 — 상세 화면의 상위 N 표와 전체 목록 창이 같은 모양을 쓴다. */
export function PositionRow({ p, onClick }: { p: FundPosition; onClick: () => void }) {
  return (
    <tr
      className={cn("border-t border-line/60", p.ticker ? "cursor-pointer hover:bg-raised/40" : "")}
      onClick={onClick}
    >
      <td className="py-1.5">
        {p.ticker ? (
          <span className="text-fg">{p.ticker}</span>
        ) : (
          <span className="text-fg-dim truncate">{p.name}</span>
        )}
      </td>
      <td className="py-1.5 text-right text-fg">{pct(p.weight, 1, false)}</td>
      <td className="py-1.5 text-right text-fg-dim">${compact(p.value)}</td>
      <td className="py-1.5 text-right text-fg-mute">{compact(p.shares)}</td>
      <td className="py-1.5 text-right">
        <ChangeBadge change={p.change} />
      </td>
    </tr>
  );
}

/** 표 머리 — 두 곳의 열 순서가 어긋나지 않게 여기 한 곳에 둔다. */
export function PositionHead() {
  return (
    <thead>
      <tr className="text-fg-mute text-micro">
        <th className="text-left font-normal pb-1.5">종목</th>
        <th className="text-right font-normal pb-1.5">비중</th>
        <th className="text-right font-normal pb-1.5">평가액</th>
        <th className="text-right font-normal pb-1.5">주식수</th>
        <th className="text-right font-normal pb-1.5">변화</th>
      </tr>
    </thead>
  );
}

const BADGE: Record<HoldingChange, { label: string; cls: string } | null> = {
  new: { label: "신규", cls: "text-up border-up/40" },
  add: { label: "증가", cls: "text-up border-up/40" },
  reduce: { label: "감소", cls: "text-down border-down/40" },
  exit: { label: "전량", cls: "text-fg-mute border-line" },
  hold: null,
};

export function ChangeBadge({ change }: { change: HoldingChange }) {
  const b = BADGE[change];
  if (!b) return <span className="text-fg-mute">—</span>;
  return <span className={cn("text-micro px-1.5 py-0.5 rounded border", b.cls)}>{b.label}</span>;
}
