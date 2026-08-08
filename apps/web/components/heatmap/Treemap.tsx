"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import {
  heatColorFor,
  type Market,
  type Period,
  type SectorsFile,
} from "@highprofit/core";
import { pct, compactEok } from "@/lib/format";
import { useChartColors } from "@/lib/theme";

/**
 * 2단 트리맵.
 * - `sector === null` → 섹터 단위. 면적=섹터 시총합, 색=섹터 수익률. 클릭하면 onDrill.
 * - `sector !== null` → 그 섹터의 구성종목. 클릭하면 onSelect(차트로 이동).
 * 한 화면에 전 종목을 펼치면 섹터가 많은 KR 에서 타일이 실오라기가 되므로 단계를 나눈다.
 */
interface Cell {
  key: string; // 종목이면 티커, 섹터면 섹터명
  label: string; // 종목이면 회사명, 섹터면 섹터명
  cap: number;
  ret: number;
  m?: Market; // 종목일 때만
}

export function Treemap({
  file,
  period,
  scope,
  sector,
  onDrill,
  onSelect,
}: {
  file: SectorsFile;
  period: Period;
  scope: Market | "ETF";
  sector: string | null;
  onDrill: (sectorName: string) => void;
  onSelect: (m: Market, t: string) => void;
}) {
  const cc = useChartColors();
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tip, setTip] = useState<{ x: number; y: number; cell: Cell } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 드릴 상태가 바뀌면 남아 있던 툴팁을 지운다.
  useEffect(() => setTip(null), [sector]);

  const cells = useMemo(() => {
    if (size.w < 10 || size.h < 10) return [] as (Cell & Box)[];

    const children: TN[] =
      sector === null
        ? file.sectors.map((s) => ({
            name: s.name,
            label: s.name,
            cap: s.cap,
            ret: s.ret[period],
          }))
        : (file.sectors.find((s) => s.name === sector)?.top ?? []).map((c) => ({
            name: c.t,
            label: c.n,
            m: c.m ?? (scope === "ETF" ? "US" : (scope as Market)),
            cap: c.cap,
            ret: c.ret[period],
          }));

    const root = hierarchy<TN>({ name: "root", children })
      .sum((d) => d.cap ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const layout = treemap<TN>()
      .tile(treemapSquarify)
      .size([size.w, size.h])
      .paddingInner(1);

    return layout(root)
      .leaves()
      .map((l) => ({
        key: l.data.name,
        label: l.data.label ?? l.data.name,
        m: l.data.m,
        cap: l.data.cap ?? 0,
        ret: l.data.ret ?? 0,
        x0: l.x0,
        y0: l.y0,
        x1: l.x1,
        y1: l.y1,
      }));
  }, [file, period, scope, sector, size]);

  const isSectorLevel = sector === null;

  return (
    <div ref={ref} className="relative w-full h-full">
      <svg width={size.w} height={size.h} className="block">
        {cells.map((c, i) => {
          const w = c.x1 - c.x0;
          const h = c.y1 - c.y0;
          // 섹터명은 티커보다 길어서 더 넓어야 읽을 만하다.
          const showText = w > (isSectorLevel ? 56 : 34) && h > 20;
          const showRet = showText && h > 34;
          const fs = isSectorLevel ? Math.max(10, Math.min(15, w / 9)) : 11;
          return (
            <g
              key={c.key + i}
              onMouseMove={(e) => {
                const box = ref.current!.getBoundingClientRect();
                setTip({ x: e.clientX - box.left, y: e.clientY - box.top, cell: c });
              }}
              onMouseLeave={() => setTip(null)}
              onClick={() => (isSectorLevel ? onDrill(c.key) : onSelect(c.m as Market, c.key))}
              className="cursor-pointer"
            >
              <rect
                x={c.x0}
                y={c.y0}
                width={Math.max(0, w)}
                height={Math.max(0, h)}
                fill={heatColorFor(c.ret, period)}
                stroke={cc.tileStroke}
                strokeWidth={0.5}
              />
              {showText && (
                <text
                  x={c.x0 + w / 2}
                  y={c.y0 + h / 2 - (showRet ? 5 : -3)}
                  textAnchor="middle"
                  fontSize={fs}
                  fontWeight={700}
                  fill="#fff"
                  style={{ pointerEvents: "none" }}
                >
                  {isSectorLevel ? c.label : c.key}
                </text>
              )}
              {showRet && (
                <text
                  x={c.x0 + w / 2}
                  y={c.y0 + h / 2 + 10}
                  textAnchor="middle"
                  fontSize={10}
                  className="num"
                  fill="#fff"
                  fillOpacity={0.85}
                  style={{ pointerEvents: "none" }}
                >
                  {pct(c.ret)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {tip && (
        <div
          className="absolute z-20 pointer-events-none rounded-lg border border-line bg-surface px-2.5 py-1.5 text-small shadow-xl"
          style={{ left: Math.min(tip.x + 12, Math.max(0, size.w - 180)), top: tip.y + 12 }}
        >
          <div className="text-fg">
            {isSectorLevel ? (
              tip.cell.label
            ) : (
              <>
                <span className="num text-fg-dim">{tip.cell.key}</span> {tip.cell.label}
              </>
            )}
          </div>
          <div className="flex justify-between gap-4 num">
            <span className="text-fg-mute">수익률</span>
            <span className={tip.cell.ret >= 0 ? "text-up" : "text-down"}>{pct(tip.cell.ret)}</span>
          </div>
          <div className="flex justify-between gap-4 num">
            <span className="text-fg-mute">{isSectorLevel ? "섹터 시총" : "시총"}</span>
            <span className="text-fg-dim">{compactEok(tip.cell.cap)}</span>
          </div>
          {isSectorLevel && (
            <div className="text-fg-mute text-micro mt-0.5">클릭하면 구성종목</div>
          )}
        </div>
      )}
    </div>
  );
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface TN {
  name: string;
  label?: string;
  m?: Market;
  cap?: number;
  ret?: number;
  children?: TN[];
}
