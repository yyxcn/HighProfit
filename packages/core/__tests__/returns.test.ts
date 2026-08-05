import { describe, it, expect } from 'vitest';
import { sma, simpleReturns, logReturns, pctChange, cumulativeReturn } from '../src/returns';
import type { Bar } from '../src/types';

const bar = (date: string, close: number): Bar => ({
  date,
  open: close,
  high: close,
  low: close,
  close,
  volume: 0,
});

describe('sma', () => {
  it('앞쪽 period-1 개는 null, 나머지는 단순평균', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
  it('period 1 은 원본과 동일', () => {
    expect(sma([10, 20, 30], 1)).toEqual([10, 20, 30]);
  });
  it('period <= 0 은 예외', () => {
    expect(() => sma([1], 0)).toThrow();
  });
});

describe('returns', () => {
  const bars = [bar('2020-01-01', 100), bar('2020-01-02', 110), bar('2020-01-03', 99)];
  it('simpleReturns 길이 n-1', () => {
    const r = simpleReturns(bars);
    expect(r).toHaveLength(2);
    expect(r[0]).toBeCloseTo(0.1, 10);
    expect(r[1]).toBeCloseTo(-0.1, 10);
  });
  it('logReturns 는 ln 비율', () => {
    expect(logReturns(bars)[0]).toBeCloseTo(Math.log(1.1), 10);
  });
  it('pctChange 첫 봉은 null', () => {
    expect(pctChange(bars)[0]).toBeNull();
  });
  it('cumulativeReturn 기하 누적', () => {
    expect(cumulativeReturn([0.1, -0.1])).toBeCloseTo(1.1 * 0.9 - 1, 10);
  });
});
