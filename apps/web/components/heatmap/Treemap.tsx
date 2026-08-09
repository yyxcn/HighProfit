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

/** 타일에 실제로 그릴 문구 — 폭에 맞춰 미리 잘라 둔 것. null 이면 그리지 않는다. */
interface Drawn extends Cell, Box {
  title: { text: string; fs: number } | null;
  code: string | null; // KR 종목 코드 (넉넉한 타일에서만)
  retText: string | null;
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

  // 웹폰트가 붙기 전 잰 글자 폭은 폴백 폰트 기준이라 어긋난다 → 로드되면 한 번 다시 맞춘다.
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    document.fonts?.ready.then(() => setFontsReady(true));
  }, []);

  const cells = useMemo(() => {
    if (size.w < 10 || size.h < 10) return [] as Drawn[];

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
      .map((l): Drawn => {
        const w = l.x1 - l.x0;
        const h = l.y1 - l.y0;
        const label = l.data.label ?? l.data.name;
        const ret = l.data.ret ?? 0;
        // KR 은 티커가 숫자 코드라 읽어도 모른다 → 종목명을 주 라벨로.
        const isKr = sector !== null && l.data.m === "KR";
        const primary = sector === null || isKr ? label : l.data.name;
        const baseFs = sector === null ? Math.max(10, Math.min(15, w / 9)) : 11;

        let title = h > 20 ? fitText(primary, w - 8, baseFs, sector === null ? 10 : 9) : null;
        // 종목명이 두 글자도 안 들어가면 짧은 코드라도 보여준다.
        if (!title && isKr && h > 20) title = fitText(l.data.name, w - 8, 10, 9);

        const retText = pct(ret);
        const showRet = !!title && h > 34 && measure(retText, 10, 500, true) <= w - 6;
        // 넉넉한 타일이면 종목명 위에 코드도 함께 (검색·주문할 때 필요).
        const showCode =
          isKr &&
          showRet &&
          h > 48 &&
          title!.text !== l.data.name &&
          measure(l.data.name, 9, 500, true) <= w - 6;

        return {
          key: l.data.name,
          label,
          m: l.data.m,
          cap: l.data.cap ?? 0,
          ret,
          x0: l.x0,
          y0: l.y0,
          x1: l.x1,
          y1: l.y1,
          title,
          code: showCode ? l.data.name : null,
          retText: showRet ? retText : null,
        };
      });
    // fontsReady 는 값을 쓰진 않지만, 웹폰트가 붙은 뒤 글자 폭을 다시 재려면 필요한 의존성이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, period, scope, sector, size, fontsReady]);

  const isSectorLevel = sector === null;

  return (
    <div ref={ref} className="relative w-full h-full">
      <svg width={size.w} height={size.h} className="block">
        {cells.map((c, i) => {
          const w = c.x1 - c.x0;
          const h = c.y1 - c.y0;
          const cy = c.y0 + h / 2;
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
              {c.code && (
                <text
                  x={c.x0 + w / 2}
                  y={cy - 15}
                  textAnchor="middle"
                  fontSize={9}
                  className="num"
                  fill="#fff"
                  fillOpacity={0.7}
                  style={{ pointerEvents: "none" }}
                >
                  {c.code}
                </text>
              )}
              {c.title && (
                <text
                  x={c.x0 + w / 2}
                  y={c.code ? cy - 1 : cy - (c.retText ? 5 : -3)}
                  textAnchor="middle"
                  fontSize={c.title.fs}
                  fontWeight={700}
                  fill="#fff"
                  style={{ pointerEvents: "none" }}
                >
                  {c.title.text}
                </text>
              )}
              {c.retText && (
                <text
                  x={c.x0 + w / 2}
                  y={c.code ? cy + 13 : cy + 10}
                  textAnchor="middle"
                  fontSize={10}
                  className="num"
                  fill="#fff"
                  fillOpacity={0.85}
                  style={{ pointerEvents: "none" }}
                >
                  {c.retText}
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

/**
 * SVG `<text>` 는 CSS 말줄임이 없어서 글자 폭을 직접 재야 타일 밖으로 안 넘친다.
 * 캔버스 컨텍스트 하나를 모듈 전역에 재사용하고, 폰트 스택은 실제 DOM 에서 읽어 온다
 * (하드코딩하면 폴백 폰트로 재서 어긋난다).
 */
let measureCtx: CanvasRenderingContext2D | null | undefined;
let sansFont = "";
let monoFont = "";

function measure(text: string, fs: number, weight: number, mono = false): number {
  if (measureCtx === undefined) measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * fs * 0.6; // 캔버스를 못 쓰면 대략치로
  if (!sansFont) {
    sansFont = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
    monoFont =
      getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim() ||
      "ui-monospace, monospace";
  }
  measureCtx.font = `${weight} ${fs}px ${mono ? monoFont : sansFont}`;
  return measureCtx.measureText(text).width;
}

/**
 * `maxW` 안에 들어가는 (문구, 폰트크기) 를 찾는다.
 * 먼저 폰트를 `minFs` 까지 줄여 통째로 맞춰 보고, 그래도 넘치면 … 로 자른다.
 * 두 글자도 못 넣으면 null — 호출부가 더 짧은 대안으로 폴백하거나 문구를 뺀다.
 */
function fitText(
  text: string,
  maxW: number,
  fs: number,
  minFs: number,
  weight = 700,
  mono = false,
): { text: string; fs: number } | null {
  if (maxW <= 0 || !text) return null;
  for (let s = Math.round(fs); s >= minFs; s--) {
    if (measure(text, s, weight, mono) <= maxW) return { text, fs: s };
  }
  const chars = [...text];
  for (let n = chars.length - 1; n >= 2; n--) {
    const cut = chars.slice(0, n).join("") + "…";
    if (measure(cut, minFs, weight, mono) <= maxW) return { text: cut, fs: minFs };
  }
  return null;
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
