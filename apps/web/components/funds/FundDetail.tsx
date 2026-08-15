"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  getFundHolding,
  type FundIndexEntry,
  type FundHolding,
  type FundPerformance,
  type FundPosition,
  type HoldingChange,
} from "@/lib/data";
import { Donut } from "@/components/funds/Donut";
import { HoldingsHeatmap } from "@/components/funds/HoldingsHeatmap";
import { FundPicker } from "@/components/funds/FundPicker";
import { RecentChanges } from "@/components/funds/RecentChanges";
import { FundSummary } from "@/components/funds/FundSummary";
import { pct, compact } from "@/lib/format";
import { cn } from "@/lib/utils";

/** 펀드 하나의 최신 분기 보유 내역 (기존 펀드 탭 화면). */
export function FundDetail({
  funds,
  file,
  onSelect,
  watch,
  onToggleWatch,
  perfByCik,
}: {
  funds: FundIndexEntry[];
  file: string | null;
  onSelect: (file: string) => void;
  watch: Set<string>;
  onToggleWatch: (cik: string) => void;
  perfByCik: Map<string, FundPerformance>;
}) {
  const router = useRouter();
  const [holding, setHolding] = useState<FundHolding | null>(null);
  const selected = funds.find((f) => f.file === file) ?? null;
  const perf = selected ? perfByCik.get(selected.cik) ?? null : null;

  useEffect(() => {
    if (!file) return;
    let alive = true;
    getFundHolding(file)
      .then((h) => alive && setHolding(h))
      .catch(() => alive && setHolding(null));
    return () => {
      alive = false;
    };
  }, [file]);

  // 펀드를 바꾸면 이전 보유내역이 잠깐 남는다 — 상태를 지우는 대신 파일 일치로 걸러낸다
  const shown = holding && `${holding.cik}_${holding.quarter}.json` === file ? holding : null;

  return (
    <div className="space-y-4">
      <FundPicker
        funds={funds}
        value={file}
        onSelect={onSelect}
        leading={
          <button
            onClick={() => selected && onToggleWatch(selected.cik)}
            disabled={!selected}
            aria-pressed={!!selected && watch.has(selected.cik)}
            title={
              selected && watch.has(selected.cik)
                ? "관심 펀드에서 빼기"
                : "관심 펀드에 추가 — 관심 탭에서 모아 봅니다"
            }
            className="grid w-11 shrink-0 place-items-center rounded-l-lg transition-colors hover:bg-raised disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <Star
              size={17}
              className={cn(
                "transition-colors",
                selected && watch.has(selected.cik) ? "text-accent fill-accent" : "text-fg-mute"
              )}
            />
          </button>
        }
      />

      <div className="min-w-0">
        {!shown && <div className="h-64 rounded-lg border border-line bg-surface animate-pulse" />}
        {shown && (
          <div className="space-y-4">
            <FundSummary entry={selected} perf={perf} holding={shown} />

            <div className="grid md:grid-cols-[240px_1fr] gap-4">
              <div className="self-start rounded-lg border border-line bg-surface p-3 space-y-3">
                <div>
                  <div className="text-small text-fg-dim mb-1">비중 (상위 10 + 기타)</div>
                  <div className="h-56">
                    <Donut positions={shown.positions} />
                  </div>
                </div>
                <div className="border-t border-line/60 pt-3">
                  <RecentChanges holding={shown} />
                </div>
              </div>

              <div className="rounded-lg border border-line bg-surface p-3 overflow-x-auto">
                <table className="w-full text-small num">
                  <thead>
                    <tr className="text-fg-mute text-micro">
                      <th className="text-left font-normal pb-1.5">종목</th>
                      <th className="text-right font-normal pb-1.5">비중</th>
                      <th className="text-right font-normal pb-1.5">평가액</th>
                      <th className="text-right font-normal pb-1.5">주식수</th>
                      <th className="text-right font-normal pb-1.5">변화</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.positions.slice(0, 30).map((p) => (
                      <PositionRow
                        key={p.cusip}
                        p={p}
                        onClick={() => p.ticker && router.push(`/chart?m=US&t=${p.ticker}`)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-lg border border-line bg-surface p-3">
              <HoldingsHeatmap holding={shown} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PositionRow({ p, onClick }: { p: FundPosition; onClick: () => void }) {
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

const BADGE: Record<HoldingChange, { label: string; cls: string } | null> = {
  new: { label: "신규", cls: "text-up border-up/40" },
  add: { label: "증가", cls: "text-up border-up/40" },
  reduce: { label: "감소", cls: "text-down border-down/40" },
  exit: { label: "전량", cls: "text-fg-mute border-line" },
  hold: null,
};

function ChangeBadge({ change }: { change: HoldingChange }) {
  const b = BADGE[change];
  if (!b) return <span className="text-fg-mute">—</span>;
  return <span className={cn("text-micro px-1.5 py-0.5 rounded border", b.cls)}>{b.label}</span>;
}
