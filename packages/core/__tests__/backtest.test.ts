import { describe, it, expect } from 'vitest';
import { backtest, yearlyReturns } from '../src/backtest';
import type { Bar } from '../src/types';

/** from 부터 n 일간 연속 캘린더 날짜에 선형 보간한 종가 시리즈 생성 */
function ramp(startDate: string, days: number, p0: number, p1: number): Bar[] {
  const out: Bar[] = [];
  const start = Date.parse(startDate);
  for (let i = 0; i < days; i++) {
    const d = new Date(start + i * 86400000).toISOString().slice(0, 10);
    const close = p0 + ((p1 - p0) * i) / (days - 1);
    out.push({ date: d, open: close, high: close, low: close, close, volume: 0 });
  }
  return out;
}

function flat(startDate: string, days: number, price: number): Bar[] {
  return ramp(startDate, days, price, price);
}

describe('backtest — 손 검증 케이스', () => {
  const days = 366;
  const a = ramp('2020-01-01', days, 100, 200); // 2배
  const b = flat('2020-01-01', days, 50); // 유지

  it('50:50 무리밸런싱 무비용 → 총수익 +50%', () => {
    const r = backtest({
      assets: [
        { ticker: 'A', weight: 0.5, bars: a },
        { ticker: 'B', weight: 0.5, bars: b },
      ],
      from: '2020-01-01',
      to: '2021-01-01',
      initialCapital: 10_000_000,
      rebalance: 'none',
      costRate: 0,
    });
    expect(r.totalReturn).toBeCloseTo(0.5, 6);
    expect(r.finalValue).toBeCloseTo(15_000_000, 2);
  });

  it('비중은 정규화된다 (50/50 == 1/1)', () => {
    const r1 = backtest({
      assets: [
        { ticker: 'A', weight: 50, bars: a },
        { ticker: 'B', weight: 50, bars: b },
      ],
      from: '2020-01-01',
      to: '2021-01-01',
      initialCapital: 1_000_000,
      rebalance: 'none',
      costRate: 0,
    });
    expect(r1.totalReturn).toBeCloseTo(0.5, 6);
  });

  it('inception 거래비용 0.5×turnover×costRate 반영', () => {
    const r = backtest({
      assets: [
        { ticker: 'A', weight: 0.5, bars: a },
        { ticker: 'B', weight: 0.5, bars: b },
      ],
      from: '2020-01-01',
      to: '2021-01-01',
      initialCapital: 1_000_000,
      rebalance: 'none',
      costRate: 0.002, // 왕복 0.2%
    });
    // invested = 1 - 0.5*0.002 = 0.999, final = 0.999 * 1.5
    expect(r.totalReturn).toBeCloseTo(0.999 * 1.5 - 1, 6);
  });

  it('단일 자산 2배 → CAGR ≈ 100% (1년)', () => {
    const r = backtest({
      assets: [{ ticker: 'A', weight: 1, bars: a }],
      from: '2020-01-01',
      to: '2020-12-31',
      initialCapital: 1_000_000,
      rebalance: 'none',
      costRate: 0,
    });
    expect(r.cagr).toBeGreaterThan(0.9);
    expect(r.cagr).toBeLessThan(1.1);
    expect(r.mdd).toBeCloseTo(0, 6); // 단조증가라 낙폭 없음
  });

  it('공통 거래일 부족 시 예외', () => {
    expect(() =>
      backtest({
        assets: [
          { ticker: 'A', weight: 1, bars: ramp('2020-01-01', 5, 100, 110) },
          { ticker: 'B', weight: 1, bars: ramp('2025-01-01', 5, 100, 110) },
        ],
        from: '2020-01-01',
        to: '2025-12-31',
        initialCapital: 1_000_000,
        rebalance: 'none',
        costRate: 0,
      })
    ).toThrow();
  });

  it('벤치마크 곡선 포함', () => {
    const r = backtest({
      assets: [{ ticker: 'A', weight: 1, bars: a }],
      from: '2020-01-01',
      to: '2020-12-31',
      initialCapital: 1_000_000,
      rebalance: 'none',
      costRate: 0,
      benchmark: { ticker: 'BM', bars: b },
    });
    expect(r.benchmark).toBeDefined();
    expect(r.benchmark![0]!.value).toBeCloseTo(1_000_000, 2); // 초기자본 정규화
  });
});

describe('yearlyReturns', () => {
  it('연말값 대비 계산', () => {
    const eq = [
      { date: '2020-01-01', value: 100 },
      { date: '2020-12-31', value: 120 },
      { date: '2021-12-31', value: 150 },
    ];
    const y = yearlyReturns(eq);
    expect(y['2020']).toBeCloseTo(0.2, 10);
    expect(y['2021']).toBeCloseTo(150 / 120 - 1, 10);
  });
});
