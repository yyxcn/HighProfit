import { describe, it, expect } from 'vitest';
import {
  heatColor,
  heatColorFor,
  capWeightedReturn,
  rangeReturn,
  CLAMP,
  PERIOD_LOOKBACK,
} from '../src/heatmap';
import type { Bar } from '../src/types';

/** 종가가 1,2,3,… 인 봉 n 개. lookback 이 몇 칸인지 눈으로 셀 수 있게 단순화한 것. */
function ramp(n: number): Bar[] {
  return Array.from({ length: n }, (_, i) => ({
    date: `2020-01-${String(i + 1).padStart(2, '0')}`,
    open: i + 1,
    high: i + 1,
    low: i + 1,
    close: i + 1,
    volume: 0,
  }));
}

describe('heatColor', () => {
  it('0% 는 flat 색', () => {
    expect(heatColor(0, 0.03)).toBe('rgb(58 69 83)');
  });
  it('+clamp 이상은 up 색으로 클램핑', () => {
    expect(heatColor(0.5, 0.03)).toBe('rgb(34 197 94)');
    expect(heatColor(0.03, 0.03)).toBe('rgb(34 197 94)');
  });
  it('-clamp 이하는 down 색으로 클램핑', () => {
    expect(heatColor(-1, 0.03)).toBe('rgb(239 68 68)');
  });
  it('기간별 클램핑 범위가 다르다', () => {
    expect(CLAMP['1d']).toBe(0.03);
    expect(CLAMP['1y']).toBe(0.4);
    // 같은 +5% 라도 1d 는 최대 초록, 1y 는 옅은 색
    expect(heatColorFor(0.05, '1d')).toBe('rgb(34 197 94)');
    expect(heatColorFor(0.05, '1y')).not.toBe('rgb(34 197 94)');
  });
});

describe('capWeightedReturn', () => {
  it('시총가중 평균', () => {
    // cap 900 @ +10%, cap 100 @ -10% → 0.9*0.1 + 0.1*(-0.1) = 0.08
    expect(capWeightedReturn([
      { cap: 900, ret: 0.1 },
      { cap: 100, ret: -0.1 },
    ])).toBeCloseTo(0.08, 10);
  });
  it('총시총 0 이면 0', () => {
    expect(capWeightedReturn([])).toBe(0);
  });
});

describe('rangeReturn / PERIOD_LOOKBACK', () => {
  it('lookback 은 파이프라인(build_sectors.py PERIODS)과 같은 거래일 수', () => {
    expect(PERIOD_LOOKBACK).toEqual({ '1d': 1, '5d': 5, '1m': 21, '3m': 63, '6m': 126, '1y': 252 });
  });

  it('종가 1..253 → 각 기간이 정확히 그 칸수만큼 되돌아본다', () => {
    const bars = ramp(253); // 마지막 종가 253
    expect(rangeReturn(bars, PERIOD_LOOKBACK['1d'])).toBeCloseTo(253 / 252 - 1, 12);
    expect(rangeReturn(bars, PERIOD_LOOKBACK['5d'])).toBeCloseTo(253 / 248 - 1, 12);
    expect(rangeReturn(bars, PERIOD_LOOKBACK['1m'])).toBeCloseTo(253 / 232 - 1, 12);
    expect(rangeReturn(bars, PERIOD_LOOKBACK['3m'])).toBeCloseTo(253 / 190 - 1, 12);
    expect(rangeReturn(bars, PERIOD_LOOKBACK['6m'])).toBeCloseTo(253 / 127 - 1, 12);
    expect(rangeReturn(bars, PERIOD_LOOKBACK['1y'])).toBeCloseTo(252, 12); // 253/1 - 1
  });

  it('봉이 lookback 이하면 0 — 호출부는 이 0 을 "0% 수익"으로 칠하면 안 된다', () => {
    expect(rangeReturn(ramp(10), 21)).toBe(0);
    expect(rangeReturn(ramp(22), 21)).toBeCloseTo(22 / 1 - 1, 12); // 딱 한 칸 넘으면 계산됨
    expect(rangeReturn([], 1)).toBe(0);
  });
});
