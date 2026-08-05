import { describe, it, expect } from 'vitest';
import {
  cagr,
  drawdownSeries,
  maxDrawdown,
  volatility,
  downsideDeviation,
  sharpe,
  sortino,
  calmar,
  drawdownPeriods,
} from '../src/metrics';

describe('cagr', () => {
  it('1년 2배 → 100%', () => {
    expect(cagr(100, 200, 1)).toBeCloseTo(1.0, 10);
  });
  it('2년 2배 → sqrt(2)-1', () => {
    expect(cagr(100, 200, 2)).toBeCloseTo(Math.SQRT2 - 1, 10);
  });
});

describe('drawdown', () => {
  const v = [100, 120, 90, 150, 75];
  it('drawdownSeries', () => {
    const dd = drawdownSeries(v);
    expect(dd[1]).toBeCloseTo(0, 10); // 신고점
    expect(dd[2]).toBeCloseTo(90 / 120 - 1, 10); // -0.25
    expect(dd[4]).toBeCloseTo(75 / 150 - 1, 10); // -0.5
  });
  it('maxDrawdown = 최저 낙폭', () => {
    expect(maxDrawdown(v)).toBeCloseTo(-0.5, 10);
  });
});

describe('risk-adjusted', () => {
  it('volatility = 표본표준편차 × √252', () => {
    const r = [0.01, -0.01, 0.02, -0.02];
    // 표본std
    const mean = 0;
    const varr = (0.01 ** 2 + 0.01 ** 2 + 0.02 ** 2 + 0.02 ** 2) / 3;
    expect(volatility(r)).toBeCloseTo(Math.sqrt(varr) * Math.sqrt(252), 8);
    expect(mean).toBe(0);
  });
  it('sharpe/sortino/calmar 부호와 정의', () => {
    expect(sharpe(0.13, 0.2, 0.03)).toBeCloseTo((0.13 - 0.03) / 0.2, 10);
    expect(sortino(0.13, 0.1, 0.03)).toBeCloseTo((0.13 - 0.03) / 0.1, 10);
    expect(calmar(0.12, -0.24)).toBeCloseTo(0.5, 10);
  });
  it('분모 0 이면 0 반환 (NaN/Infinity 방지)', () => {
    expect(sharpe(0.1, 0)).toBe(0);
    expect(sortino(0.1, 0)).toBe(0);
    expect(calmar(0.1, 0)).toBe(0);
    expect(downsideDeviation([0.01, 0.02])).toBe(0); // 하락 없음
  });
});

describe('drawdownPeriods', () => {
  it('회복/미회복 구간을 깊이순으로', () => {
    const s = [
      { date: '2020-01-01', value: 100 },
      { date: '2020-01-02', value: 80 }, // -20% 진입
      { date: '2020-01-03', value: 70 }, // 저점 -30%
      { date: '2020-01-04', value: 100 }, // 회복
      { date: '2020-01-05', value: 110 }, // 신고점
      { date: '2020-01-06', value: 99 }, // 미회복 낙폭 -10%
    ];
    const ps = drawdownPeriods(s);
    expect(ps).toHaveLength(2);
    // 가장 깊은 게 먼저
    expect(ps[0]!.depth).toBeCloseTo(70 / 100 - 1, 10);
    expect(ps[0]!.trough).toBe('2020-01-03');
    expect(ps[0]!.end).toBe('2020-01-04');
    expect(ps[0]!.recoveryDays).toBe(1);
    // 미회복 구간
    const open = ps.find((p) => p.end === null)!;
    expect(open.depth).toBeCloseTo(99 / 110 - 1, 10);
    expect(open.recoveryDays).toBeNull();
  });
});
