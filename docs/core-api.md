# Core API — `@highprofit/core`

React/DOM 의존성 0. 순수 함수만. 모든 함수 vitest(`packages/core/__tests__`).
날짜는 항상 `'YYYY-MM-DD'` 문자열, `close`는 수정주가 전제.

## types.ts
`Market('KR'|'US')`, `SecurityType`, `Bar`, `UniverseItem`, `Period`, `Sector`/`SectorsFile`/`SectorConstituent`, `Meta`.

## returns.ts
- `sma(values, period)` → `(number|null)[]` — 앞 `period-1`개 null.
- `simpleReturns(bars)` / `logReturns(bars)` / `pctChange(bars)` / `cumulativeReturn(returns)`.

## metrics.ts (명세 6-4)
- `cagr(start,end,years)` · `drawdownSeries(values)` · `maxDrawdown(values)`
- `volatility(daily)` = std×√252 · `downsideDeviation(daily)`
- `sharpe(cagr,vol,rf=0.03)` · `sortino(cagr,dd,rf)` · `calmar(cagr,mdd)` (분모 0 → 0)
- `drawdownPeriods(series)` → 낙폭 구간(깊이순, 미회복 end=null).

## seasonality.ts (명세 6-3)
- `seasonality(bars, fromYear, toYear)` → `SeasonalPoint[]`
  - 로그수익률을 MM-DD 그룹핑 → `exp(로그평균)`으로 기하평균 경로. 윤년 02-29 제외.
  - 필드: `mmdd,n,avg,max,min,winRate,composite,tStat`.
- `monthlySeasonality(...)` → 월별(표본 신뢰도 높음). `MonthlyPoint[]`
- `monthlyReturnMatrix(bars, fromYear, toYear)` → `MonthlyReturnRow[]` — 계절성 탭의 연도×월 매트릭스.

## backtest.ts (명세 6-4)
- `backtest(input: BacktestInput)` → `BacktestResult` — 자산은 `BacktestAsset[]`, 주기는 `Rebalance`.
  - **공통 거래일 inner join**(휴장일 상이 대응).
  - 리밸런싱 비용 = `0.5 × Σ|목표−현재| × costRate`(왕복).
  - 미국 달러 기준(환율 미반영), 수정주가라 배당 재투자 반영.
- `yearlyReturns(equity)`.

## heatmap.ts
- `CLAMP` — 기간별 색 클램핑(1d±3% … 1y±40%).
- `heatColor(ret, clamp)` / `heatColorFor(ret, period)` — 5-stop 연속 보간.
- `capWeightedReturn(items)` · `topConstituents(sector,n)` · `rangeReturn(bars,lookback)`.
- `PERIOD_LOOKBACK` — 기간→거래일 수(1d:1 … 1y:252). 파이프라인 `daily/build_sectors.py` 의 `PERIODS` 와
  같은 값이어야 사전집계 히트맵과 브라우저 계산(펀드 보유종목 히트맵)의 색이 어긋나지 않는다.
  봉이 lookback 이하면 `rangeReturn` 이 0 을 주므로, 호출부는 그 0 을 "0% 수익"으로 칠하지 말고 따로 구분한다.

## fees.ts
- `KR_TAX`(2026-01-01 기준: 코스피/코스닥 매도 0.20%, 주식형 ETF 비과세), `DEFAULT_ROUND_TRIP_COST`, `DEFAULT_RF`, `FEE_EFFECTIVE_DATE`. 세율은 여기 한 곳에만.

## 손검증 규칙
새 함수는 **손으로 계산한 케이스**를 테스트에 넣는다(예: 2자산 50:50 → 총수익 +50% 등, `__tests__/backtest.test.ts`).
