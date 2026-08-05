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
funds/{CIK}_{YYYYQn}.json      펀드 보유내역
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
섹터 수익률 = 구성종목 **시총가중 평균**(단순평균 금지). `top`은 시총 상위 20.

## funds — 13F (명세 6-5)

`index.json`: `{ asOf, funds:[{ cik, name, latest, file, aum, positions, filedAt }] }`
보유 파일: `{ cik, name, quarter, filedAt, aum, positions:[ { cusip, ticker|null, name, value, shares, weight, change, deltaShares } ] }`
`change` = `new|add|reduce|exit|hold`.

타입 정의: `packages/core/src/types.ts`, `apps/web/lib/data.ts`(펀드).
