import type { Bar } from './types';

/**
 * 단순이동평균. 앞쪽 period-1 개는 표본이 부족하므로 null.
 * lightweight-charts 는 { time, value } 로 매핑해서 쓴다.
 */
export function sma(values: number[], period: number): (number | null)[] {
  if (period <= 0) throw new Error('period must be > 0');
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** 단순수익률 r_t = close_t / close_{t-1} - 1. 길이 n-1. */
export function simpleReturns(bars: Bar[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    out.push(bars[i]!.close / bars[i - 1]!.close - 1);
  }
  return out;
}

/** 로그수익률 ln(close_t / close_{t-1}). 길이 n-1. */
export function logReturns(bars: Bar[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    out.push(Math.log(bars[i]!.close / bars[i - 1]!.close));
  }
  return out;
}

/** 등락률 (전봉 대비 %). 첫 봉은 null. 크로스헤어 표시용. */
export function pctChange(bars: Bar[]): (number | null)[] {
  const out: (number | null)[] = [null];
  for (let i = 1; i < bars.length; i++) {
    out.push(bars[i]!.close / bars[i - 1]!.close - 1);
  }
  return out;
}

/** 일간 수익률 배열 → 누적 수익률 (기하). */
export function cumulativeReturn(returns: number[]): number {
  return returns.reduce((acc, r) => acc * (1 + r), 1) - 1;
}
