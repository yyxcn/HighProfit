import type { Bar, Period, Sector, SectorConstituent } from './types';

/** 기간별 색상 클램핑 범위 (명세 4-2, 6-2). 장기 탭이 전부 새빨개지는 것 방지. */
export const CLAMP: Record<Period, number> = {
  '1d': 0.03,
  '5d': 0.05,
  '1m': 0.1,
  '3m': 0.18,
  '6m': 0.28,
  '1y': 0.4,
};

const STOPS = {
  down: [0xef, 0x44, 0x44], // --color-down
  downSoft: [0x7f, 0x27, 0x27], // --color-down-soft
  flat: [0x3a, 0x45, 0x53], // --color-flat
  upSoft: [0x16, 0x64, 0x3a], // --color-up-soft
  up: [0x22, 0xc5, 0x5e], // --color-up
} as const;

function lerp(a: readonly number[], b: readonly number[], t: number): string {
  const r = Math.round(a[0]! + (b[0]! - a[0]!) * t);
  const g = Math.round(a[1]! + (b[1]! - a[1]!) * t);
  const bl = Math.round(a[2]! + (b[2]! - a[2]!) * t);
  return `rgb(${r} ${g} ${bl})`;
}

/**
 * 수익률 → 히트맵 색. clamp 범위에서 5-stop 연속 보간.
 *  -clamp ─ -clamp/2 ─ 0 ─ +clamp/2 ─ +clamp
 *  down    downSoft   flat  upSoft     up
 */
export function heatColor(ret: number, clamp: number): string {
  const x = Math.max(-clamp, Math.min(clamp, ret)) / clamp; // -1..1
  if (x <= -0.5) return lerp(STOPS.down, STOPS.downSoft, (x + 1) / 0.5);
  if (x < 0) return lerp(STOPS.downSoft, STOPS.flat, (x + 0.5) / 0.5);
  if (x === 0) return lerp(STOPS.flat, STOPS.flat, 0);
  if (x <= 0.5) return lerp(STOPS.flat, STOPS.upSoft, x / 0.5);
  return lerp(STOPS.upSoft, STOPS.up, (x - 0.5) / 0.5);
}

/** 편의: 기간까지 받아 색 반환. */
export function heatColorFor(ret: number, period: Period): string {
  return heatColor(ret, CLAMP[period]);
}

/**
 * 구성종목 → 섹터 수익률 (시총가중 평균). 단순평균은 소형주 노이즈가 지배하므로 금지.
 * 파이프라인(build_sectors.py)이 사전계산하지만, 검증/재계산용으로 core 에도 둔다.
 */
export function capWeightedReturn(items: { cap: number; ret: number }[]): number {
  const totalCap = items.reduce((a, x) => a + x.cap, 0);
  if (totalCap <= 0) return 0;
  return items.reduce((a, x) => a + (x.cap / totalCap) * x.ret, 0);
}

/** 특정 기간 수익률로 섹터의 top 을 시총 내림차순 정렬 후 상위 N. */
export function topConstituents(sector: Sector, n = 20): SectorConstituent[] {
  return [...sector.top].sort((a, b) => b.cap - a.cap).slice(0, n);
}

/** 두 종가 사이 기간수익률. (히트맵 사전집계 검증용) */
export function rangeReturn(bars: Bar[], lookback: number): number {
  if (bars.length <= lookback) return 0;
  const end = bars[bars.length - 1]!.close;
  const start = bars[bars.length - 1 - lookback]!.close;
  return start > 0 ? end / start - 1 : 0;
}

/**
 * 기간 → 되돌아볼 거래일 수. 파이프라인(`daily/build_sectors.py` 의 `PERIODS`)과 **같은 값**이어야
 * 사전집계 히트맵과 브라우저에서 계산한 히트맵의 색이 어긋나지 않는다.
 */
export const PERIOD_LOOKBACK: Record<Period, number> = {
  '1d': 1,
  '5d': 5,
  '1m': 21,
  '3m': 63,
  '6m': 126,
  '1y': 252,
};
