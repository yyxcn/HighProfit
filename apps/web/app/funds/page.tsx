"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Landmark, AlertTriangle } from "lucide-react";
import {
  getFundsIndex,
  getFundHolding,
  type FundIndex,
  type FundHolding,
  type FundPosition,
  type HoldingChange,
} from "@/lib/data";
import { EmptyState } from "@/components/common/EmptyState";
import { Donut } from "@/components/funds/Donut";
import { FundPicker } from "@/components/funds/FundPicker";
import { RecentChanges } from "@/components/funds/RecentChanges";
import { pct, compact, ymd } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function FundsPage() {
  const router = useRouter();
  const [index, setIndex] = useState<FundIndex | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [holding, setHolding] = useState<FundHolding | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    getFundsIndex()
      .then((idx) => {
        setIndex(idx);
        setStatus("ok");
        if (idx.funds[0]) setSel(idx.funds[0].file);
      })
      .catch(() => setStatus("error"));
  }, []);

  useEffect(() => {
    if (!sel) return;
    setHolding(null);
    getFundHolding(sel).then(setHolding).catch(() => setHolding(null));
  }, [sel]);

  if (status === "error") {
    return (
      <div className="p-4 md:p-6">
        <EmptyState icon={Landmark} title="펀드 데이터를 불러오지 못했습니다. 분기 파이프라인 실행 후 다시 시도하세요." />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* 한계 고지 (명세 6-5) */}
      <div className="flex items-start gap-2 rounded-lg border border-accent-dim/50 bg-accent-dim/10 px-3 py-2 text-small text-fg-dim">
        <AlertTriangle size={15} className="text-accent shrink-0 mt-0.5" />
        <p>
          13F는 <b className="text-fg">45일 지연 공시</b>이며 <b className="text-fg">롱온리</b>(공매도·옵션숏·현금·채권·해외주식 제외)입니다.
          실시간 추종용이 아니라 <b className="text-fg">참고용</b>입니다.
        </p>
      </div>

      {/* 펀드 선택 드롭다운 */}
      <FundPicker funds={index?.funds ?? []} value={sel} onSelect={setSel} />

      {/* 보유 내역 */}
      <div className="min-w-0">
        {!holding && <div className="h-64 rounded-lg border border-line bg-surface animate-pulse" />}
        {holding && (
          <div className="space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-fg font-semibold text-h2">{holding.name}</h2>
                <div className="num text-small text-fg-mute">
                  {holding.quarter} 기준 · {ymd(holding.filedAt)} 공시 · 운용 ${compact(holding.aum)}
                </div>
              </div>

              <div className="grid md:grid-cols-[240px_1fr] gap-4">
                <div className="self-start rounded-lg border border-line bg-surface p-3 space-y-3">
                  <div>
                    <div className="text-small text-fg-dim mb-1">비중 (상위 10 + 기타)</div>
                    <div className="h-56"><Donut positions={holding.positions} /></div>
                  </div>
                  <div className="border-t border-line/60 pt-3">
                    <RecentChanges holding={holding} />
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
                      {holding.positions.slice(0, 30).map((p) => (
                        <PositionRow key={p.cusip} p={p} onClick={() => p.ticker && router.push(`/chart?m=US&t=${p.ticker}`)} />
                      ))}
                    </tbody>
                  </table>
                </div>
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
        {p.ticker ? <span className="text-fg">{p.ticker}</span> : <span className="text-fg-dim truncate">{p.name}</span>}
      </td>
      <td className="py-1.5 text-right text-fg">{pct(p.weight, 1, false)}</td>
      <td className="py-1.5 text-right text-fg-dim">${compact(p.value)}</td>
      <td className="py-1.5 text-right text-fg-mute">{compact(p.shares)}</td>
      <td className="py-1.5 text-right"><ChangeBadge change={p.change} /></td>
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
