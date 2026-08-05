import { describe, it, expect } from 'vitest';
import { seasonality, monthlySeasonality, monthlyReturnMatrix } from '../src/seasonality';
import type { Bar } from '../src/types';

const bar = (date: string, close: number): Bar => ({
  date,
  open: close,
  high: close,
  low: close,
  close,
  volume: 0,
});

describe('seasonality', () => {
  // 2년치: 매년 01-02 는 +10%, 01-03 은 -5% 로 고정.
  const bars: Bar[] = [
    bar('2020-01-01', 100),
    bar('2020-01-02', 110), // +10%
    bar('2020-01-03', 104.5), // -5%
    bar('2021-01-01', 200),
    bar('2021-01-02', 220), // +10%
    bar('2021-01-03', 209), // -5%
  ];

  it('mmdd 그룹핑 + 표본수 n', () => {
    const s = seasonality(bars, 2020, 2021);
    // 01-01 은 이전 봉이 전년 마지막이라 경계 넘는 수익률이 섞임 — 존재 여부만 확인
    const d0102 = s.find((p) => p.mmdd === '01-02')!;
    expect(d0102.n).toBe(2);
    expect(d0102.avg).toBeCloseTo(0.1, 8);
    expect(d0102.winRate).toBe(1);
  });

  it('01-03 은 항상 하락 → 승률 0, 평균 -5%', () => {
    const s = seasonality(bars, 2020, 2021);
    const d = s.find((p) => p.mmdd === '01-03')!;
    expect(d.avg).toBeCloseTo(-0.05, 8);
    expect(d.winRate).toBe(0);
  });

  it('composite 는 1/1 부터 누적', () => {
    const s = seasonality(bars, 2020, 2021);
    // 정렬된 마지막 지점의 composite 는 전체 곱 - 1
    const last = s[s.length - 1]!;
    expect(typeof last.composite).toBe('number');
  });

  it('윤년 02-29 제외', () => {
    const withLeap = [...bars, bar('2020-02-28', 100), bar('2020-02-29', 105)];
    const s = seasonality(withLeap, 2020, 2021);
    expect(s.find((p) => p.mmdd === '02-29')).toBeUndefined();
  });

  it('fromYear/toYear 범위 밖은 제외', () => {
    const s = seasonality(bars, 2021, 2021);
    const d = s.find((p) => p.mmdd === '01-02')!;
    expect(d.n).toBe(1);
  });
});

describe('monthlySeasonality', () => {
  it('12개월 항상 반환', () => {
    const bars = [bar('2020-01-31', 100), bar('2020-02-28', 110)];
    const m = monthlySeasonality(bars, 2020, 2020);
    expect(m).toHaveLength(12);
    expect(m.map((x) => x.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe('monthlyReturnMatrix', () => {
  // 2020: 2월 +10%, 3월 +10% (1월은 첫 봉이라 이전 수익률 없음 → null)
  //       연간 = 1.1 × 1.1 − 1 = +21%
  // 2021: 1월 +10%
  const bars: Bar[] = [
    bar('2020-01-31', 100),
    bar('2020-02-28', 110), // 2월 +10%
    bar('2020-03-31', 121), // 3월 +10%
    bar('2021-01-29', 133.1), // 1월 +10%
  ];

  it('최신 연도 먼저 정렬', () => {
    const rows = monthlyReturnMatrix(bars, 2019, 2022);
    expect(rows.map((r) => r.year)).toEqual([2021, 2020]);
  });

  it('월 인덱스 배치 + 데이터 없는 달은 null', () => {
    const rows = monthlyReturnMatrix(bars, 2019, 2022);
    const y2020 = rows.find((r) => r.year === 2020)!;
    expect(y2020.months).toHaveLength(12);
    expect(y2020.months[0]).toBeNull(); // 1월 (첫 봉, 수익률 없음)
    expect(y2020.months[1]).toBeCloseTo(0.1, 8); // 2월
    expect(y2020.months[2]).toBeCloseTo(0.1, 8); // 3월
    expect(y2020.months[3]).toBeNull(); // 4월
  });

  it('연간 total 은 월수익률 복리곱', () => {
    const rows = monthlyReturnMatrix(bars, 2019, 2022);
    expect(rows.find((r) => r.year === 2020)!.total).toBeCloseTo(0.21, 8);
    expect(rows.find((r) => r.year === 2021)!.total).toBeCloseTo(0.1, 8);
  });

  it('범위 밖 연도는 제외', () => {
    const rows = monthlyReturnMatrix(bars, 2021, 2021);
    expect(rows.map((r) => r.year)).toEqual([2021]);
  });
});
