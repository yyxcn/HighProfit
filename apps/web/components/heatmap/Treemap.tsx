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

interface Leaf {
  kind: "leaf";
  t: string;
  n: string;
  m: Market;
  sector: string;
  cap: number;
  ret: number;
}
interface Header {
  kind: "header";
  name: string;
  ret: number;
}
type Node = Leaf | Header;

export function Treemap({
  file,
  period,
  scope,
  onSelect,
}: {
  file: SectorsFile;
  period: Period;
  scope: Market | "ETF";
  onSelect: (m: Market, t: string) => void;
}) {
  const cc = useChartColors();
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tip, setTip] = useState<{ x: number; y: number; leaf: Leaf } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { rects, headers } = useMemo(() => {
    const empty = { rects: [] as (Leaf & Box)[], headers: [] as (Header & Box)[] };
    if (size.w < 10 || size.h < 10) return empty;

    const data: TN = {
      name: "root",
      children: file.sectors.map((s) => ({
        name: s.name,
        ret: s.ret[period],
        children: s.top.map((c) => ({
          name: c.t,
          label: c.n,
          m: c.m ?? (scope === "ETF" ? "US" : (scope as Market)),
          sector: s.name,
          cap: c.cap,
          ret: c.ret[period],
        })),
      })),
    };

    const root = hierarchy<TN>(data)
      .sum((d) => d.cap ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const layout = treemap<TN>()
      .tile(treemapSquarify)
      .size([size.w, size.h])
      .paddingTop(16)
      .paddingInner(1);
    const rootR = layout(root);

    const rects: (Leaf & Box)[] = rootR.leaves().map((l) => ({
      kind: "leaf",
      t: l.data.name,
      n: l.data.label ?? l.data.name,
      m: l.data.m as Market,
      sector: l.data.sector ?? "",
      cap: l.data.cap ?? 0,
      ret: l.data.ret ?? 0,
      x0: l.x0, y0: l.y0, x1: l.x1, y1: l.y1,
    }));
    const headers: (Header & Box)[] = (rootR.children ?? []).map((s) => ({
      kind: "header",
      name: s.data.name,
      ret: s.data.ret ?? 0,
      x0: s.x0, y0: s.y0, x1: s.x1, y1: s.y1,
    }));
    return { rects, headers };
  }, [file, period, scope, size]);

  return (
    <div ref={ref} className="relative w-full h-full">
      <svg width={size.w} height={size.h} className="block">
        {headers.map((h, i) => (
          <g key={`h${i}`}>
            <text x={h.x0 + 4} y={h.y0 + 11} fill={cc.headerText} fontSize={11} fontWeight={600}>
              {h.name}
            </text>
            <text
              x={h.x1 - 4}
              y={h.y0 + 11}
              textAnchor="end"
              fontSize={11}
              className="num"
              fill={h.ret >= 0 ? cc.up : cc.down}
            >
              {pct(h.ret)}
            </text>
          </g>
        ))}
        {rects.map((r, i) => {
          const w = r.x1 - r.x0;
          const hgt = r.y1 - r.y0;
          const showText = w > 34 && hgt > 20;
          const showRet = w > 34 && hgt > 34;
          return (
            <g
              key={`r${i}`}
              onMouseMove={(e) => {
                const box = ref.current!.getBoundingClientRect();
                setTip({ x: e.clientX - box.left, y: e.clientY - box.top, leaf: r });
              }}
              onMouseLeave={() => setTip(null)}
              onClick={() => onSelect(r.m, r.t)}
              className="cursor-pointer"
            >
              <rect
                x={r.x0}
                y={r.y0}
                width={Math.max(0, w)}
                height={Math.max(0, hgt)}
                fill={heatColorFor(r.ret, period)}
                stroke={cc.tileStroke}
                strokeWidth={0.5}
              />
              {showText && (
                <text
                  x={r.x0 + w / 2}
                  y={r.y0 + hgt / 2 - (showRet ? 5 : -3)}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={700}
                  fill="#fff"
                  style={{ pointerEvents: "none" }}
                >
                  {r.t}
                </text>
              )}
              {showRet && (
                <text
                  x={r.x0 + w / 2}
                  y={r.y0 + hgt / 2 + 10}
                  textAnchor="middle"
                  fontSize={10}
                  className="num"
                  fill="#fff"
                  fillOpacity={0.85}
                  style={{ pointerEvents: "none" }}
                >
                  {pct(r.ret)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {tip && (
        <div
          className="absolute z-20 pointer-events-none rounded-lg border border-line bg-surface px-2.5 py-1.5 text-small shadow-xl"
          style={{ left: Math.min(tip.x + 12, size.w - 160), top: tip.y + 12 }}
        >
          <div className="text-fg">
            <span className="num text-fg-dim">{tip.leaf.t}</span> {tip.leaf.n}
          </div>
          <div className="flex justify-between gap-4 num">
            <span className="text-fg-mute">수익률</span>
            <span className={tip.leaf.ret >= 0 ? "text-up" : "text-down"}>{pct(tip.leaf.ret)}</span>
          </div>
          <div className="flex justify-between gap-4 num">
            <span className="text-fg-mute">시총</span>
            <span className="text-fg-dim">{compactEok(tip.leaf.cap)}</span>
          </div>
          <div className="text-fg-mute text-micro mt-0.5">{tip.leaf.sector}</div>
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
  sector?: string;
  cap?: number;
  ret?: number;
  children?: TN[];
}
