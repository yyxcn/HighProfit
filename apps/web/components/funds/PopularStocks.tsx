"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { FundPopularFile, PopularKind, PopularStock } from "@/lib/data";
import { compact } from "@/lib/format";
import { cn } from "@/lib/utils";

const KINDS: { key: PopularKind; label: string; hint: string }[] = [
  { key: "hold", label: "인기 보유", hint: "해당 분기에 보유한 매니저 수" },
  { key: "new", label: "신규 매수", hint: "해당 분기에 새로 편입한 매니저 수" },
  { key: "exit", label: "청산", hint: "해당 분기에 전량 매도한 매니저 수" },
];

/**
 * 분기별 13F 합산 랭킹. 매니저 수 → 총 평가액 순.
 * '광범위 보유' 펀드(퀀트·대형 운용사)는 수백~수천 종목을 들어 카운트를 지배하므로 기본 제외한다.
 */
export function PopularStocks({ file }: { file: FundPopularFile }) {
  const router = useRouter();
  const quarters = useMemo(() => [...file.quarters].reverse(), [file.quarters]);
  // 가장 최근 분기는 아직 대부분의 펀드가 신고 전이라 표가 텅 빈다 — 신고가 가장 많은 분기로 연다.
  const [quarter, setQuarter] = useState(
    () => quarters.reduce((a, b) => (b.filed > a.filed ? b : a), quarters[0]!)?.quarter ?? ""
  );
  const [kind, setKind] = useState<PopularKind>("hold");
  const [includeBroad, setIncludeBroad] = useState(false);

  const q = quarters.find((x) => x.quarter === quarter) ?? quarters[0];
  const rows: PopularStock[] = q ? (includeBroad ? q.all : q.focused)[kind] : [];

  if (!q) {
    return <p className="text-small text-fg-mute">집계된 분기가 없습니다.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-small text-fg-dim">
          분기
          <select
            value={quarter}
            onChange={(e) => setQuarter(e.target.value)}
            className="num rounded-md border border-line bg-surface px-2 py-1 text-fg outline-none focus:border-accent"
          >
            {quarters.map((x) => (
              <option key={x.quarter} value={x.quarter}>
                {x.quarter} ({x.filed}/{x.total})
              </option>
            ))}
          </select>
        </label>
        <span className="num text-micro text-fg-mute">
          펀드 신고 {q.filed}/{q.total}
        </span>

        <label className="ml-auto flex items-center gap-2 text-small text-fg-dim cursor-pointer">
          <input
            type="checkbox"
            checked={includeBroad}
            onChange={(e) => setIncludeBroad(e.target.checked)}
            className="accent-[var(--color-accent)]"
          />
          인덱스성 펀드 포함
          <span className="num text-micro text-fg-mute">({file.broadThreshold}종목+)</span>
        </label>
      </div>

      <div className="inline-flex rounded-md border border-line bg-surface p-0.5">
        {KINDS.map((k) => (
          <button
            key={k.key}
            onClick={() => setKind(k.key)}
            title={k.hint}
            className={cn(
              "text-small px-2.5 py-1 rounded transition-colors",
              kind === k.key ? "bg-raised text-fg" : "text-fg-dim hover:text-fg"
            )}
          >
            {k.label} <span className="num text-micro text-fg-mute">Top {file.topN}</span>
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-line bg-surface overflow-x-auto">
        <table className="w-full text-small">
          <thead>
            <tr className="text-fg-mute text-micro border-b border-line">
              <th className="text-left font-normal px-2 py-2.5 w-10">#</th>
              <th className="text-left font-normal px-2 py-2.5 w-20">티커</th>
              <th className="text-left font-normal px-2 py-2.5">종목명</th>
              <th className="text-right font-normal px-2 py-2.5 whitespace-nowrap">매니저 수</th>
              <th className="text-right font-normal px-2 py-2.5 whitespace-nowrap">
                {kind === "exit" ? "직전 분기 가치" : "총 가치"}
              </th>
              <th className="text-left font-normal px-2 py-2.5 hidden md:table-cell">TOP 3 매니저</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.cusip} className="border-b border-line/60 last:border-0 hover:bg-raised/40">
                <td className="num px-2 py-2 text-fg-mute">{i + 1}</td>
                <td className="num px-2 py-2">
                  {r.ticker ? (
                    <button
                      onClick={() => router.push(`/chart?m=US&t=${r.ticker}`)}
                      className="text-accent hover:underline"
                    >
                      {r.ticker}
                    </button>
                  ) : (
                    <span className="text-fg-mute">—</span>
                  )}
                </td>
                <td className="px-2 py-2 text-fg-dim truncate max-w-56">{r.name}</td>
                <td className="num px-2 py-2 text-right text-fg font-semibold">{r.managers}</td>
                <td className="num px-2 py-2 text-right text-fg-dim">
                  {r.value > 0 ? `$${compact(r.value)}` : "—"}
                </td>
                <td className="px-2 py-2 text-fg-dim hidden md:table-cell">
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                    {r.top.map((t) => (
                      <span key={t} className="text-micro whitespace-nowrap">
                        {t}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="px-3 py-10 text-center text-small text-fg-mute">
            이 분기에는 해당하는 종목이 없습니다.
          </p>
        )}
      </div>
    </div>
  );
}
