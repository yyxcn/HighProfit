import type { Bar } from './types';

export interface SeasonalPoint {
  mmdd: string; // 'MM-DD'
  n: number; // 표본 연수
  avg: number; // 해당 일자 평균 수익률 (기하)
  max: number; // 최대
  min: number; // 최소
  winRate: number; // 승률 0~1
  composite: number; // 1/1 부터의 누적 평균 경로
  tStat: number; // 통계적 유의성 (|t| < 2 → 노이즈)
}

/**
 * 계절성 집계. 명세 6-3.
 * 로그수익률을 MM-DD 로 그룹핑 → exp(로그평균) 으로 기하평균 경로를 만든다.
 * 산술평균 누적은 실제 복리 경로와 어긋나므로 쓰지 않는다.
 */
export function seasonality(bars: Bar[], fromYear: number, toYear: number): SeasonalPoint[] {
  const buckets = new Map<string, number[]>();

  for (let i = 1; i < bars.length; i++) {
    const cur = bars[i]!;
    const y = +cur.date.slice(0, 4);
    if (y < fromYear || y > toYear) continue;
    const mmdd = cur.date.slice(5);
    if (mmdd === '02-29') continue; // 윤년 제외
    const prevClose = bars[i - 1]!.close;
    if (prevClose <= 0 || cur.close <= 0) continue;
    const lr = Math.log(cur.close / prevClose);
    let arr = buckets.get(mmdd);
    if (!arr) {
      arr = [];
      buckets.set(mmdd, arr);
    }
    arr.push(lr);
  }

  let composite = 1;
  return [...buckets.keys()].sort().map((mmdd) => {
    const rs = buckets.get(mmdd)!;
    const n = rs.length;
    const mu = rs.reduce((a, b) => a + b, 0) / n; // 로그평균 = 기하평균
    const sd = Math.sqrt(
      rs.reduce((a, r) => a + (r - mu) ** 2, 0) / Math.max(n - 1, 1)
    );
    composite *= Math.exp(mu);
    return {
      mmdd,
      n,
      avg: Math.exp(mu) - 1,
      max: Math.exp(Math.max(...rs)) - 1,
      min: Math.exp(Math.min(...rs)) - 1,
      winRate: rs.filter((r) => r > 0).length / n,
      composite: composite - 1,
      tStat: sd === 0 ? 0 : mu / (sd / Math.sqrt(n)),
    };
  });
}

/** 월별 평균수익률 (일별보다 표본 신뢰도가 높음). 보조 막대차트용. */
export interface MonthlyPoint {
  month: number; // 1~12
  avg: number; // 기하 평균 월수익률
  n: number; // 표본 (월 × 연도)
  tStat: number;
}

export function monthlySeasonality(
  bars: Bar[],
  fromYear: number,
  toYear: number
): MonthlyPoint[] {
  // 각 (연,월) 의 로그수익률 합 → 월간 로그수익률, 그걸 월별로 모아 평균
  const byYearMonth = new Map<string, number>();
  for (let i = 1; i < bars.length; i++) {
    const cur = bars[i]!;
    const y = +cur.date.slice(0, 4);
    if (y < fromYear || y > toYear) continue;
    const ym = cur.date.slice(0, 7); // 'YYYY-MM'
    const prevClose = bars[i - 1]!.close;
    if (prevClose <= 0 || cur.close <= 0) continue;
    byYearMonth.set(ym, (byYearMonth.get(ym) ?? 0) + Math.log(cur.close / prevClose));
  }

  const byMonth = new Map<number, number[]>();
  for (const [ym, lr] of byYearMonth) {
    const m = +ym.slice(5, 7);
    let arr = byMonth.get(m);
    if (!arr) {
      arr = [];
      byMonth.set(m, arr);
    }
    arr.push(lr);
  }

  const out: MonthlyPoint[] = [];
  for (let m = 1; m <= 12; m++) {
    const rs = byMonth.get(m) ?? [];
    const n = rs.length;
    if (n === 0) {
      out.push({ month: m, avg: 0, n: 0, tStat: 0 });
      continue;
    }
    const mu = rs.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(rs.reduce((a, r) => a + (r - mu) ** 2, 0) / Math.max(n - 1, 1));
    out.push({
      month: m,
      avg: Math.exp(mu) - 1,
      n,
      tStat: sd === 0 ? 0 : mu / (sd / Math.sqrt(n)),
    });
  }
  return out;
}

/** 연도 × 월 수익률 표 한 행. months[0..11] = 1~12월, 데이터 없으면 null. */
export interface MonthlyReturnRow {
  year: number;
  months: (number | null)[]; // 길이 12
  total: number | null; // 해당 연도 내 월수익률 복리(연간)
}

/**
 * 연도별 월간 수익률 매트릭스 (계절성 탭 상세 표용).
 * 각 (연,월)의 일별 로그수익률 합 → 월간 단순수익률 exp(합)-1.
 * 연간 total = 그 해 존재하는 월들의 복리곱. 최신 연도 먼저 정렬.
 */
export function monthlyReturnMatrix(
  bars: Bar[],
  fromYear: number,
  toYear: number
): MonthlyReturnRow[] {
  const byYearMonth = new Map<string, number>(); // 'YYYY-MM' → 월간 로그수익률 합
  for (let i = 1; i < bars.length; i++) {
    const cur = bars[i]!;
    const y = +cur.date.slice(0, 4);
    if (y < fromYear || y > toYear) continue;
    const prevClose = bars[i - 1]!.close;
    if (prevClose <= 0 || cur.close <= 0) continue;
    const ym = cur.date.slice(0, 7);
    byYearMonth.set(ym, (byYearMonth.get(ym) ?? 0) + Math.log(cur.close / prevClose));
  }

  const byYear = new Map<number, (number | null)[]>();
  for (const [ym, lr] of byYearMonth) {
    const y = +ym.slice(0, 4);
    const m = +ym.slice(5, 7);
    let row = byYear.get(y);
    if (!row) {
      row = Array(12).fill(null) as (number | null)[];
      byYear.set(y, row);
    }
    row[m - 1] = Math.exp(lr) - 1;
  }

  return [...byYear.keys()]
    .sort((a, b) => b - a) // 최신 연도 먼저
    .map((year) => {
      const months = byYear.get(year)!;
      let prod = 1;
      let has = false;
      for (const r of months) {
        if (r != null) {
          prod *= 1 + r;
          has = true;
        }
      }
      return { year, months, total: has ? prod - 1 : null };
    });
}
