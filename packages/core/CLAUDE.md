# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`@highprofit/core` — 금융 계산 **순수 함수** 라이브러리. UI(apps/web)가 `transpilePackages` 로 소비한다.
UI 를 다시 짜도 이 패키지는 100% 재사용된다. 레포 전체 규칙은 `../../CLAUDE.md`, API 상세는 `../../docs/core-api.md`.

## Critical Rules (절대 규칙)

- **React / DOM / Next 를 단 한 줄도 import 하지 않는다.** 부수효과 없는 순수 함수만.
- **모든 export 함수에 vitest 테스트.** 금융 계산은 조용히 틀리는 게 제일 위험 — **손으로 계산한 케이스**를 넣는다(예: 2자산 50:50 무리밸런싱 → 총수익 +50%).
- **날짜는 전부 `'YYYY-MM-DD'` 문자열.** Date 객체를 로직에 흘리지 않는다.
- **`close` 는 수정주가 전제.** 계절성·백테스트는 분할/배당 반영값을 가정.
- **수수료·세율은 `src/fees.ts` 한 곳에만**(시행일 주석 필수).
- 인덱스 접근은 `noUncheckedIndexedAccess` 적용 — `arr[i]!` 또는 undefined 체크.

## Architecture

```
packages/core/
├── src/
│   ├── types.ts          # Bar, UniverseItem, Market, Sector/SectorsFile, Meta …
│   ├── returns.ts        # sma, simpleReturns, logReturns, pctChange, cumulativeReturn
│   ├── metrics.ts        # cagr, drawdownSeries/maxDrawdown, volatility, sharpe/sortino/calmar, drawdownPeriods
│   ├── seasonality.ts    # seasonality(로그수익률 기하평균 경로), monthlySeasonality
│   ├── backtest.ts       # backtest(공통거래일 inner join·리밸런싱·거래비용), yearlyReturns
│   ├── heatmap.ts        # CLAMP(기간별), heatColor/heatColorFor, capWeightedReturn
│   ├── fees.ts           # KR_TAX·DEFAULT_ROUND_TRIP_COST·DEFAULT_RF (시행일 주석)
│   └── index.ts          # 배럴 export (여기로만 공개)
├── __tests__/            # vitest — returns/metrics/seasonality/backtest/heatmap (34)
├── vitest.config.ts
└── tsconfig.json         # strict + noUncheckedIndexedAccess, exports 는 src 직접(빌드 산출물 없음)
```

새 함수는 `src/<domain>.ts` 에 추가 → `index.ts` 에 export → `__tests__/<domain>.test.ts` 에 손검증 케이스.

## Commands

```bash
npm run test                         # vitest run (전체)
npm run test:watch                   # watch
npm run test -- __tests__/backtest.test.ts   # 단일 파일
npm run test -- -t "50:50"                    # 이름 필터
npm run build                        # tsc --noEmit (타입체크만; 빌드 산출물 없이 web 이 src 를 직접 transpile)
```

## Domain Notes (계산 규약)

- **계절성** — 로그수익률을 MM-DD 그룹핑, `exp(로그평균)`으로 기하평균 경로(산술평균 누적은 복리와 어긋남). 윤년 02-29 제외. `tStat` 으로 유의성 판단(`|t|<2`는 노이즈).
- **백테스트** — KR/US 휴장일 상이 → **공통 거래일 inner join**. 리밸런싱 비용 = `0.5 × Σ|목표−현재| × costRate`(왕복). 미국은 달러 기준(환율 미반영), 수정주가라 배당 재투자 반영.
- **지표** — 연변동성 std×√252, Sharpe/Sortino/Calmar 분모 0 이면 0 반환(NaN/Infinity 방지).
- **히트맵 색** — 기간별 클램핑(`CLAMP`: 1d±3% … 1y±40%)으로 5-stop 보간. 섹터 수익률은 시총가중.
