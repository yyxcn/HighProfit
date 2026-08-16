# Data Schema

R2 버킷 루트(= 로컬 `apps/web/public/data`) 레이아웃. `NEXT_PUBLIC_DATA_BASE`(기본 `/data`)로 접근.

```
meta.json                     { lastUpdatedKR, lastUpdatedUS, lastUpdated13F }
universe.json                 검색 인덱스(전 종목, 시총 내림차순)
universe_kr.json / _us.json   병합 전 부분 결과
ohlcv/KR/005930.parquet       종목당 1파일 (snappy)
ohlcv/US/AAPL.parquet
sectors/KR.json / US.json / ETF.json   히트맵 사전집계
funds/index.json              펀드 목록
funds/{CIK}_{YYYYQn}.json      펀드 보유내역(최신 분기만)
funds/performance.json        펀드별 추정 성과 랭킹 (Overview 탭)
funds/popular.json            분기별 인기 보유/신규 매수/청산 (인기 주식 탭)
```

## OHLCV parquet (명세 5-3)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| date | string | `'YYYY-MM-DD'` |
| open/high/low/close | float32 | **close = 수정주가** |
| volume | int64 | 브라우저에서 BigInt→`Number()` |

- 압축 **snappy 고정**(hyparquet 브라우저 리더가 zstd 미지원).
- 정렬: date 오름차순.

## universe.json — `UniverseItem[]`

```json
{ "t":"005930", "n":"삼성전자", "m":"KR", "e":"KOSPI", "s":"반도체", "c":4200000, "type":"stock" }
```
`t`티커 `n`이름 `m`시장(KR|US) `e`거래소 `s`섹터 `c`시총(억) `type`(stock|etf).

## sectors/{scope}.json — `SectorsFile` (명세 5-5)

```json
{ "asOf":"2026-08-03", "sectors":[
  { "name":"반도체", "cap":8200000, "ret":{"1d":..,"5d":..,"1m":..,"3m":..,"6m":..,"1y":..},
    "top":[ { "t":"005930","n":"삼성전자","m":"KR","cap":4200000,"ret":{...} } ] } ] }
```
섹터 수익률 = 구성종목 **시총가중 평균**(단순평균 금지). `top`은 시총 상위 **50** —
히트맵에서 섹터를 클릭했을 때 보여줄 구성종목 목록(드릴다운)의 데이터 소스다.

## funds — 13F (명세 6-5)

`index.json`: `{ asOf, funds:[{ cik, name, manager, category, latest, file, aum, positions, filedAt, inception, quarters }] }`
보유 파일: `{ cik, name, quarter, filedAt, aum, positions:[ { cusip, ticker|null, name, value, shares, weight, change, deltaShares } ] }`
`change` = `new|add|reduce|exit|hold`. 보유 파일은 **최신 분기만** 배포한다 — 과거 분기 원본은
`pipeline/.cache/13f/` 에만 있고 아래 두 집계 파일의 입력으로만 쓰인다.

`performance.json`: `{ asOf, funds:[{ cik, name, manager, category, inception, inceptionDate,
latest, filedAt, active, quarters, aum, positions, ret1y, cagr3y, cagr5y, cagrInception,
totalReturn, coverage, reliability, curve:[[date, index]] }] }`
- 공시일 기준 분기 리밸런싱을 가정한 **추정** 롱온리 성과. 실제 펀드 수익률이 아니다.
- `filedAt` = 마지막 분기(`latest`)를 SEC 에 실제로 신고한 날. 분기말이 아니다 — 표에 이 날짜를 보여준다.
- `coverage` = 티커 매핑된 보유분의 가치 비중, `reliability` = `high|mid|low`
  (계산은 유지하되 **UI 에서는 쓰지 않는다** — 표의 그 자리는 `filedAt` 이 차지한다).
- `curve` 는 월말 샘플, 시작값 1.0.

`popular.json`: `{ asOf, topN, broadThreshold, quarters:[{ quarter, filed, total,
all:{hold,new,exit}, focused:{hold,new,exit} }] }`
- 각 목록은 `[{ cusip, ticker|null, name, managers, value, top:[매니저 3] }]`, 매니저 수 → 총 가치 순.
- `focused` 는 한 분기에 `broadThreshold`(500) 종목 이상 보유한 **인덱스성 펀드를 뺀** 집계.
  퀀트·대형 운용사가 수천 종목을 들어 카운트를 지배하는 것을 막는다.
- `exit` 의 `value` 는 이번 분기가 0 이므로 **직전 분기 평가액**이다.

타입 정의: `packages/core/src/types.ts`, `apps/web/lib/data.ts`(펀드).
