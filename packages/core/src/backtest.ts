import type { Bar } from './types';
import {
  cagr,
  calmar,
  drawdownPeriods,
  downsideDeviation,
  maxDrawdown,
  sharpe,
  sortino,
  volatility,
  type DrawdownPeriod,
} from './metrics';

export type Rebalance = 'none' | 'monthly' | 'quarterly' | 'yearly';

export interface BacktestAsset {
  ticker: string;
  weight: number; // 0~1 (혹은 % — 내부에서 정규화)
  bars: Bar[];
}

export interface BacktestInput {
  assets: BacktestAsset[];
  from: string; // 'YYYY-MM-DD'
  to: string;
  initialCapital: number;
  rebalance: Rebalance;
  benchmark?: { ticker: string; bars: Bar[] };
  costRate: number; // 왕복 비용률, 예: 0.002 (0.2%)
  rf?: number; // 무위험수익률, 기본 0.03
}

export interface BacktestResult {
  equity: { date: string; value: number }[];
  benchmark?: { date: string; value: number }[];
  cagr: number;
  mdd: number;
  sharpe: number;
  sortino: number;
  volatility: number;
  calmar: number;
  totalReturn: number;
  finalValue: number;
  yearly: Record<string, number>;
  drawdowns: DrawdownPeriod[];
}

function priceMap(bars: Bar[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of bars) m.set(b.date, b.close);
  return m;
}

/** 신규 리밸런싱 구간 진입 여부 (직전 거래일 대비 구간 키가 바뀌었는가). */
function periodKey(date: string, mode: Rebalance): string {
  switch (mode) {
    case 'monthly':
      return date.slice(0, 7);
    case 'quarterly': {
      const y = date.slice(0, 4);
      const q = Math.floor((+date.slice(5, 7) - 1) / 3);
      return `${y}Q${q}`;
    }
    case 'yearly':
      return date.slice(0, 4);
    case 'none':
      return 'all';
  }
}

function yearFraction(from: string, to: string): number {
  const d = (Date.parse(to) - Date.parse(from)) / 86400000;
  return Math.max(d / 365.25, 1 / 365.25);
}

/**
 * 포트폴리오 백테스트. 명세 6-4.
 * - 공통 거래일 inner join (휴장일 상이 대응)
 * - 리밸런싱 비용: 0.5 × Σ|목표가치 − 현재가치| × costRate
 *   (Σ|Δ| 는 매도+매수 양변을 세므로 ×0.5 가 실제 편도 거래액. costRate 는 왕복.)
 * - 미국 자산은 달러 기준 (환율 미반영), 배당은 수정주가로 재투자 반영.
 */
export function backtest(input: BacktestInput): BacktestResult {
  const { assets, from, to, initialCapital, rebalance, costRate } = input;
  const rf = input.rf ?? 0.03;
  if (assets.length === 0) throw new Error('at least one asset required');

  const wsum = assets.reduce((a, x) => a + x.weight, 0);
  if (wsum <= 0) throw new Error('weights must sum to a positive number');
  const weights = assets.map((a) => a.weight / wsum);
  const maps = assets.map((a) => priceMap(a.bars));

  // 공통 거래일: 첫 자산 날짜를 기준으로 나머지 자산 모두가 가진 날짜만, [from,to] 범위 내
  const base = assets[0]!.bars.map((b) => b.date).filter((d) => d >= from && d <= to);
  const dates = base.filter((d) => maps.every((m) => m.has(d))).sort();
  if (dates.length < 2) {
    throw new Error('공통 거래일이 부족합니다. 자산/기간을 확인하세요.');
  }

  // 벤치마크 가격을 공통 거래일에 맞춰 전방보간
  let benchPrices: (number | null)[] | null = null;
  if (input.benchmark) {
    const bm = priceMap(input.benchmark.bars);
    let last: number | null = null;
    benchPrices = dates.map((d) => {
      const p = bm.get(d);
      if (p !== undefined) last = p;
      return last;
    });
  }

  const equity: { date: string; value: number }[] = [];
  let shares = new Array(assets.length).fill(0);
  let prevKey: string | null = null;

  for (let t = 0; t < dates.length; t++) {
    const date = dates[t]!;
    const prices = maps.map((m) => m.get(date)!);
    const isInception = t === 0;
    const key = periodKey(date, rebalance);
    const isRebalance = isInception || (rebalance !== 'none' && key !== prevKey);
    prevKey = key;

    let value: number;
    if (isInception) {
      value = initialCapital;
    } else {
      value = shares.reduce((acc, s, i) => acc + s * prices[i]!, 0);
    }

    if (isRebalance) {
      const curVals = isInception
        ? new Array(assets.length).fill(0)
        : shares.map((s, i) => s * prices[i]!);
      const targets = weights.map((w) => value * w);
      let turnover = 0;
      for (let i = 0; i < assets.length; i++) turnover += Math.abs(targets[i]! - curVals[i]!);
      const cost = 0.5 * turnover * costRate;
      const invested = value - cost;
      shares = weights.map((w, i) => (invested * w) / prices[i]!);
      value = invested;
    }

    equity.push({ date, value });
  }

  // 벤치마크 자산곡선 (초기자본 기준 정규화)
  let benchmark: { date: string; value: number }[] | undefined;
  if (benchPrices) {
    const first = benchPrices.find((p) => p !== null) ?? null;
    if (first) {
      benchmark = dates.map((d, i) => ({
        date: d,
        value: initialCapital * ((benchPrices![i] ?? first) / first),
      }));
    }
  }

  const values = equity.map((e) => e.value);
  const finalValue = values[values.length - 1]!;
  const years = yearFraction(dates[0]!, dates[dates.length - 1]!);
  const dailyReturns: number[] = [];
  for (let i = 1; i < values.length; i++) dailyReturns.push(values[i]! / values[i - 1]! - 1);

  const cagrVal = cagr(initialCapital, finalValue, years);
  const vol = volatility(dailyReturns);
  const mdd = maxDrawdown(values);

  return {
    equity,
    benchmark,
    cagr: cagrVal,
    mdd,
    sharpe: sharpe(cagrVal, vol, rf),
    sortino: sortino(cagrVal, downsideDeviation(dailyReturns), rf),
    volatility: vol,
    calmar: calmar(cagrVal, mdd),
    totalReturn: finalValue / initialCapital - 1,
    finalValue,
    yearly: yearlyReturns(equity),
    drawdowns: drawdownPeriods(equity).slice(0, 5),
  };
}

/** 연도별 수익률 = 해당 연말값 / 직전 연말값 − 1. 첫 해는 시작값 기준. */
export function yearlyReturns(equity: { date: string; value: number }[]): Record<string, number> {
  const lastOfYear = new Map<string, number>();
  for (const { date, value } of equity) lastOfYear.set(date.slice(0, 4), value);
  const years = [...lastOfYear.keys()].sort();
  const out: Record<string, number> = {};
  let prev = equity[0]?.value ?? 0;
  for (const y of years) {
    const end = lastOfYear.get(y)!;
    out[y] = prev > 0 ? end / prev - 1 : 0;
    prev = end;
  }
  return out;
}
