"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  getFundHolding,
  type FundIndexEntry,
  type FundHolding,
  type FundPerformance,
} from "@/lib/data";
import { Donut } from "@/components/funds/Donut";
import { HoldingsHeatmap } from "@/components/funds/HoldingsHeatmap";
import { PositionsModal } from "@/components/funds/PositionsModal";
import { PositionRow, PositionHead } from "@/components/funds/PositionRow";
import { FundPicker } from "@/components/funds/FundPicker";
import { RecentChanges } from "@/components/funds/RecentChanges";
import { SectorMix } from "@/components/funds/SectorMix";
import { CapMix } from "@/components/funds/CapMix";
import { FundSummary } from "@/components/funds/FundSummary";
import { pct } from "@/lib/format";
import { cn } from "@/lib/utils";

/** 상세 화면 표에 바로 보여 줄 종목 수. 나머지는 "전체 N종목 보기" 창에서. */
const TOP_N = 30;

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

  // 전체 목록 창. 어느 펀드로 열었는지까지 담아 두면 펀드를 바꿨을 때 저절로 닫힌다.
  const shownKey = shown ? `${shown.cik}_${shown.quarter}` : null;
  const [allFor, setAllFor] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {/* 요약 카드와 검색+선택 드롭다운을 나란히. 선택 UI 는 보유내역 로딩과 무관하게 항상 둔다
          — 불러오는 동안 사라지면 펀드를 바꿀 수가 없다. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        {shown ? (
          <FundSummary entry={selected} perf={perf} holding={shown} />
        ) : (
          <div className="h-40 rounded-lg border border-line bg-surface animate-pulse" />
        )}
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
      </div>

      <div className="min-w-0">
        {!shown && <div className="h-64 rounded-lg border border-line bg-surface animate-pulse" />}
        {shown && (
          <div className="space-y-4">

            <div className="grid md:grid-cols-[290px_1fr] gap-4">
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
                <div className="border-t border-line/60 pt-3">
                  <SectorMix holding={shown} />
                </div>
                <div className="border-t border-line/60 pt-3">
                  <CapMix holding={shown} />
                </div>
              </div>

              <div className="rounded-lg border border-line bg-surface p-3 overflow-x-auto">
                <table className="w-full text-small num">
                  <PositionHead />
                  <tbody>
                    {shown.positions.slice(0, TOP_N).map((p) => (
                      <PositionRow
                        key={p.cusip}
                        p={p}
                        onClick={() => p.ticker && router.push(`/chart?m=US&t=${p.ticker}`)}
                      />
                    ))}
                  </tbody>
                </table>

                {/* 13F 는 수천 종목짜리 펀드가 흔하다 — 몇 개를 보고 있는 건지 밝히고 전체는 창으로 */}
                {shown.positions.length > TOP_N && (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2">
                    <span className="num text-micro text-fg-mute">
                      상위 {TOP_N}종목 · 전체 {shown.positions.length}종목 중 비중{" "}
                      {pct(
                        shown.positions.slice(0, TOP_N).reduce((a, p) => a + p.weight, 0),
                        1,
                        false
                      )}
                    </span>
                    <button
                      onClick={() => setAllFor(shownKey)}
                      className="num text-micro text-fg-dim transition-colors hover:text-accent"
                    >
                      전체 {shown.positions.length}종목 보기
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-line bg-surface p-3">
              <HoldingsHeatmap holding={shown} />
            </div>

            <PositionsModal
              holding={shown}
              open={allFor === shownKey}
              onClose={() => setAllFor(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
