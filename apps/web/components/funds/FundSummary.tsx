"use client";

import type { FundHolding, FundIndexEntry, FundPerformance } from "@/lib/data";
import { pct, compact, ymd } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * 펀드 상세 상단 요약 — 매니저/운용사/카테고리 + 규모·기간별 성과 한 줄.
 * 수익률은 performance.json(추정치) 에서 오고, 규모는 그 분기 13F 원본에서 온다.
 */
export function FundSummary({
  entry,
  perf,
  holding,
}: {
  entry: FundIndexEntry | null;
  perf: FundPerformance | null;
  holding: FundHolding;
}) {
  const title = perf?.manager || entry?.manager || perf?.name || holding.name;
  const firm = perf?.name || entry?.name || holding.name;
  const category = perf?.category || entry?.category || "";
  const since = (perf?.inception || entry?.inception || "").slice(0, 4);

  const stats: { label: string; value: number | null; dir?: boolean }[] = [
    { label: "1Y", value: perf?.ret1y ?? null, dir: true },
    { label: "3Y (연)", value: perf?.cagr3y ?? null, dir: true },
    { label: "5Y (연)", value: perf?.cagr5y ?? null, dir: true },
    { label: "설정후 (연)", value: perf?.cagrInception ?? null, dir: true },
    { label: "설정후 (총)", value: perf?.totalReturn ?? null, dir: true },
  ];

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          {/* 매니저 이름 옆에 운용사명, 그 아래 한 줄로 카테고리·설정연도 */}
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 className="text-fg font-semibold text-h2">{title}</h2>
            {title !== firm && <p className="text-fg-dim text-sm truncate">{firm}</p>}
          </div>
          <p className="text-small text-fg-mute mt-1">
            {category && <span>{category}</span>}
            {category && since && <span className="mx-1.5">·</span>}
            {since && <span className="num">Since {since}</span>}
          </p>
        </div>
        <div className="num text-small text-fg-mute shrink-0 sm:mr-2">
          {holding.quarter} 기준 · {ymd(holding.filedAt)} 공시
        </div>
      </div>

      {/* 오른쪽에 펀드 목록이 붙어 카드 폭이 줄었다 — 7열은 아주 넓은 화면에서만. */}
      <dl className="mt-4 grid grid-cols-3 gap-x-4 gap-y-3 sm:grid-cols-4 xl:grid-cols-7">
        <Stat label="AUM" text={`$${compact(holding.aum)}`} />
        <Stat label="보유 종목" text={`${entry?.positions ?? perf?.positions ?? "—"}개`} />
        {stats.map((s) => (
          <Stat
            key={s.label}
            label={s.label}
            text={pct(s.value)}
            // 손익 방향에만 초록/빨강 (프로젝트 색 규칙)
            className={s.value == null ? "text-fg-mute" : s.value > 0 ? "text-up" : s.value < 0 ? "text-down" : "text-fg"}
          />
        ))}
      </dl>

      {!perf && (
        <p className="mt-3 text-micro text-fg-mute">
          이 펀드는 성과 집계 대상이 아닙니다 (티커 매핑 커버리지 부족).
        </p>
      )}
    </div>
  );
}

function Stat({ label, text, className }: { label: string; text: string; className?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-micro text-fg-mute whitespace-nowrap">{label}</dt>
      <dd className={cn("num text-sm font-semibold mt-0.5 truncate", className ?? "text-fg")}>
        {text}
      </dd>
    </div>
  );
}
