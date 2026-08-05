/**
 * 성과지표. 모두 순수 함수.
 * 정의는 명세 6-4 절을 따른다.
 */

const TRADING_DAYS = 252;

export interface DrawdownPoint {
  date: string;
  value: number; // 0 이하 (낙폭 비율)
}

export interface DrawdownPeriod {
  start: string; // 직전 고점 날짜
  trough: string; // 저점 날짜
  end: string | null; // 회복(고점 재도달) 날짜, 미회복이면 null
  depth: number; // 저점에서의 낙폭 (음수)
  recoveryDays: number | null; // trough → end 영업일 수
}

/** CAGR = (V_end / V_start)^(1/years) - 1 */
export function cagr(startValue: number, endValue: number, years: number): number {
  if (startValue <= 0 || years <= 0) return 0;
  return Math.pow(endValue / startValue, 1 / years) - 1;
}

/** 자산곡선(값 배열) → 각 시점 낙폭 시리즈. Drawdown_t = V_t / max(V_0..V_t) - 1 */
export function drawdownSeries(values: number[]): number[] {
  const out: number[] = [];
  let peak = -Infinity;
  for (const v of values) {
    if (v > peak) peak = v;
    out.push(peak > 0 ? v / peak - 1 : 0);
  }
  return out;
}

/** MDD = min(Drawdown_t). 음수(또는 0)를 반환. */
export function maxDrawdown(values: number[]): number {
  const dd = drawdownSeries(values);
  return dd.length ? Math.min(...dd) : 0;
}

/** 연변동성 = std(일간수익률) × √252. 표본표준편차(n-1). */
export function volatility(dailyReturns: number[]): number {
  return stdev(dailyReturns) * Math.sqrt(TRADING_DAYS);
}

/** 하방편차 = std( min(r,0) ) × √252. Sortino 분모. */
export function downsideDeviation(dailyReturns: number[]): number {
  const downs = dailyReturns.map((r) => Math.min(r, 0));
  return stdev(downs) * Math.sqrt(TRADING_DAYS);
}

/** Sharpe = (CAGR - Rf) / 연변동성 */
export function sharpe(cagrValue: number, vol: number, rf = 0.03): number {
  if (vol === 0) return 0;
  return (cagrValue - rf) / vol;
}

/** Sortino = (CAGR - Rf) / 하방편차 */
export function sortino(cagrValue: number, dd: number, rf = 0.03): number {
  if (dd === 0) return 0;
  return (cagrValue - rf) / dd;
}

/** Calmar = CAGR / |MDD| */
export function calmar(cagrValue: number, mdd: number): number {
  if (mdd === 0) return 0;
  return cagrValue / Math.abs(mdd);
}

/**
 * 낙폭 구간 목록. 고점에서 벗어나 저점을 찍고 고점을 재도달하기까지를 한 구간으로.
 * 미회복 구간(현재 진행 중)은 end=null 로 포함.
 */
export function drawdownPeriods(
  series: { date: string; value: number }[]
): DrawdownPeriod[] {
  const periods: DrawdownPeriod[] = [];
  if (series.length === 0) return periods;

  let peak = series[0]!.value;
  let peakDate = series[0]!.date;
  let inDrawdown = false;
  let trough = peak;
  let troughDate = peakDate;
  let troughIdx = 0;

  for (let i = 0; i < series.length; i++) {
    const { date, value } = series[i]!;
    if (value >= peak) {
      // 고점 재도달 → 진행 중이던 낙폭 종료
      if (inDrawdown) {
        periods.push({
          start: peakDate,
          trough: troughDate,
          end: date,
          depth: trough / peak - 1,
          recoveryDays: i - troughIdx,
        });
        inDrawdown = false;
      }
      peak = value;
      peakDate = date;
    } else {
      if (!inDrawdown) {
        inDrawdown = true;
        trough = value;
        troughDate = date;
        troughIdx = i;
      } else if (value < trough) {
        trough = value;
        troughDate = date;
        troughIdx = i;
      }
    }
  }
  if (inDrawdown) {
    periods.push({
      start: peakDate,
      trough: troughDate,
      end: null,
      depth: trough / peak - 1,
      recoveryDays: null,
    });
  }
  return periods.sort((a, b) => a.depth - b.depth);
}

function stdev(xs: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const variance = xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance);
}

export const _internal = { stdev, TRADING_DAYS };
