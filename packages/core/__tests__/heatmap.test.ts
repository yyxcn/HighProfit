import { describe, it, expect } from 'vitest';
import { heatColor, heatColorFor, capWeightedReturn, CLAMP } from '../src/heatmap';

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
