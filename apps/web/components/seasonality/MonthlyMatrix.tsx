"use client";

import type { MonthlyReturnRow } from "@highprofit/core";
import { pct } from "@/lib/format";

const MONTHS = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

/** 수익률 → 셀 배경 틴트. 손익 방향(초록/빨강)에 크기별 투명도. 규칙 준수: 방향색은 P&L 전용. */
function cellBg(r: number | null): string | undefined {
  if (r == null || r === 0) return undefined;
  const a = Math.min(Math.abs(r) / 0.15, 1) * 26; // 0~26% 알파 (±15%에서 최대)
  const token = r > 0 ? "--color-up" : "--color-down";
  return `color-mix(in srgb, var(${token}) ${a.toFixed(0)}%, transparent)`;
}

function cellText(r: number | null): string {
  if (r == null) return "text-fg-mute";
  if (r > 0) return "text-up";
  if (r < 0) return "text-down";
  return "text-fg-dim";
}

/**
 * 연도 × 월 수익률 매트릭스. 각 셀은 월간 수익률(방향색 히트맵), 우측 열은 연간 총수익.
 * 데이터 없는 달은 '·'.
 */
export function MonthlyMatrix({ rows }: { rows: MonthlyReturnRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-small">
        <thead>
          <tr className="text-fg-mute">
            <th className="sticky left-0 bg-surface/80 backdrop-blur px-3 py-2.5 text-left font-medium text-micro uppercase tracking-wider">
              연도
            </th>
            {MONTHS.map((m) => (
              <th key={m} className="px-2.5 py-2.5 text-right num font-normal">
                {m.replace("월", "")}
              </th>
            ))}
            <th className="px-3 py-2.5 text-right font-medium text-micro uppercase tracking-wider">
              연간
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.year} className="border-t border-line/60 hover:bg-raised/40 transition-colors">
              <td className="sticky left-0 bg-surface/80 backdrop-blur px-3 py-2 text-left num text-fg-dim">
                {row.year}
              </td>
              {row.months.map((r, i) => (
                <td
                  key={i}
                  className={`px-2.5 py-2 text-right num ${cellText(r)}`}
                  style={{ backgroundColor: cellBg(r) }}
                  title={r == null ? undefined : `${MONTHS[i]} ${pct(r)}`}
                >
                  {r == null ? <span className="text-fg-mute/50">·</span> : pct(r, 1)}
                </td>
              ))}
              <td
                className={`px-3 py-2 text-right num font-semibold ${cellText(row.total)} border-l border-line/60`}
              >
                {row.total == null ? "—" : pct(row.total, 1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
