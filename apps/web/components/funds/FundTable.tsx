"use client";

import { useMemo, useState } from "react";
import { Star, ArrowUpDown, AlertTriangle } from "lucide-react";
import type { FundPerformance, FundReliability } from "@/lib/data";
import { pct, dirClass, compact } from "@/lib/format";
import { cn } from "@/lib/utils";

type SortKey = "ret1y" | "cagr3y" | "cagr5y" | "cagrInception" | "aum" | "positions";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "ret1y", label: "1Y 수익률" },
  { key: "cagr3y", label: "3Y 연환산" },
  { key: "cagr5y", label: "5Y 연환산" },
  { key: "cagrInception", label: "설정후 연환산" },
];

/** 이력이 2년(8분기) 미만이면 성과 표본이 얕다 — 표에 '신생' 으로 티를 낸다. */
const YOUNG_QUARTERS = 8;

/**
 * 펀드 성과 랭킹 표. Overview 와 관심 탭이 공유한다.
 * 정렬은 열 헤더 클릭, 즐겨찾기는 별 아이콘.
 */
export function FundTable({
  funds,
  watch,
  onToggleWatch,
  onSelect,
}: {
  funds: FundPerformance[];
  watch: Set<string>;
  onToggleWatch: (cik: string) => void;
  onSelect: (cik: string) => void;
}) {
  const [sort, setSort] = useState<SortKey>("cagrInception");
  const [desc, setDesc] = useState(true);

  const rows = useMemo(() => {
    const sorted = [...funds].sort((a, b) => {
      const av = a[sort];
      const bv = b[sort];
      // 값 없는 펀드(이력 부족)는 방향과 무관하게 항상 아래로
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return desc ? bv - av : av - bv;
    });
    return sorted;
  }, [funds, sort, desc]);

  const click = (k: SortKey) => {
    if (k === sort) setDesc((d) => !d);
    else {
      setSort(k);
      setDesc(true);
    }
  };

  return (
    <div className="rounded-lg border border-line bg-surface overflow-x-auto">
      <table className="w-full text-small">
        <thead>
          <tr className="text-fg-mute text-micro border-b border-line">
            <th className="w-8" />
            <th className="text-left font-normal px-2 py-2.5 w-10">#</th>
            <th className="text-left font-normal px-2 py-2.5">매니저</th>
            <th className="text-left font-normal px-2 py-2.5 hidden md:table-cell">카테고리</th>
            <th className="text-right font-normal px-2 py-2.5 hidden sm:table-cell">설정</th>
            {COLUMNS.map((c) => (
              <th key={c.key} className="text-right font-normal px-2 py-2.5">
                <button
                  onClick={() => click(c.key)}
                  className={cn(
                    "inline-flex items-center gap-1 transition-colors",
                    sort === c.key ? "text-accent" : "hover:text-fg"
                  )}
                >
                  {c.label}
                  {sort === c.key ? (
                    <span className="num text-[9px]">{desc ? "▼" : "▲"}</span>
                  ) : (
                    <ArrowUpDown size={10} className="opacity-40" />
                  )}
                </button>
              </th>
            ))}
            <th className="text-right font-normal px-2 py-2.5 hidden lg:table-cell">신뢰도</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f, i) => (
            <tr key={f.cik} className="border-b border-line/60 last:border-0 hover:bg-raised/40">
              <td className="pl-2">
                <button
                  onClick={() => onToggleWatch(f.cik)}
                  aria-label={watch.has(f.cik) ? "관심 해제" : "관심 추가"}
                  className="grid place-items-center h-7 w-7 rounded transition-colors hover:bg-raised"
                >
                  <Star
                    size={13}
                    className={cn(
                      "transition-colors",
                      watch.has(f.cik) ? "text-accent fill-accent" : "text-fg-mute"
                    )}
                  />
                </button>
              </td>
              <td className="num px-2 py-2.5 text-fg-mute">{i + 1}</td>
              <td className="px-2 py-2.5 min-w-40">
                <button onClick={() => onSelect(f.cik)} className="text-left group">
                  <div className="text-fg font-semibold group-hover:text-accent transition-colors truncate">
                    {f.manager || f.name}
                  </div>
                  {f.manager && (
                    <div className="text-micro text-fg-mute truncate">{f.name}</div>
                  )}
                </button>
              </td>
              <td className="px-2 py-2.5 text-fg-dim hidden md:table-cell whitespace-nowrap">
                {f.category || "—"}
              </td>
              <td className="num px-2 py-2.5 text-right text-fg-dim hidden sm:table-cell whitespace-nowrap">
                {f.inception.slice(0, 4)}
                {f.quarters < YOUNG_QUARTERS && (
                  <span className="ml-1 text-micro px-1 py-0.5 rounded border border-accent-dim/60 text-accent">
                    신생
                  </span>
                )}
              </td>
              {COLUMNS.map((c) => (
                <td key={c.key} className="num px-2 py-2.5 text-right whitespace-nowrap">
                  <Ret v={f[c.key] as number | null} />
                </td>
              ))}
              <td className="px-2 py-2.5 text-right hidden lg:table-cell">
                <Reliability level={f.reliability} coverage={f.coverage} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 && (
        <p className="px-3 py-10 text-center text-small text-fg-mute">표시할 펀드가 없습니다.</p>
      )}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-line text-micro text-fg-mute">
        <span>
          AUM 합계 ${compact(rows.reduce((s, f) => s + f.aum, 0))} · {rows.length}개 펀드
        </span>
      </div>
    </div>
  );
}

function Ret({ v }: { v: number | null }) {
  if (v == null) return <span className="text-fg-mute">—</span>;
  return <span className={dirClass(v)}>{pct(v)}</span>;
}

const RELIABILITY: Record<FundReliability, string | null> = {
  high: null,
  mid: "보통",
  low: "낮음",
};

/**
 * 신뢰도 = CUSIP→티커 매핑 커버리지(가치 기준) + 이력 길이.
 * 방향색(초록/빨강)은 손익 전용이라 여기서는 중립 톤만 쓴다.
 */
function Reliability({ level, coverage }: { level: FundReliability; coverage: number }) {
  const label = RELIABILITY[level];
  if (!label) return <span className="text-fg-mute">—</span>;
  return (
    <span
      title={`추정 커버리지 ${pct(coverage, 0, false)} — 티커 매핑이 안 된 보유분은 성과 계산에서 빠졌습니다.`}
      className="inline-flex items-center gap-1 text-micro px-1.5 py-0.5 rounded border border-line bg-raised text-fg-dim whitespace-nowrap"
    >
      <AlertTriangle size={10} className="text-accent" />
      {label}
    </span>
  );
}
