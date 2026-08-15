# Frontend Architecture

`apps/web` — Next.js 16 App Router, `output: 'export'` (정적). 모든 페이지는 클라이언트에서
데이터를 fetch 해 렌더한다(빌드 시 데이터 불필요).

## 라우트 (탭)

| 경로 | 파일 | 데이터 | 비고 |
|---|---|---|---|
| `/` | `app/page.tsx` | 계절성(KOSPI 프록시) | 랜딩 히어로 + bento |
| `/chart` | `app/chart/page.tsx` | TV 위젯 / 우리 일봉 | `?m=KR&t=005930` 계약 |
| `/heatmap` | `app/heatmap/page.tsx` | TV 위젯 / sectors JSON | `?m=&p=` 계약 |
| `/seasonality` | `app/seasonality/page.tsx` | parquet → core | |
| `/backtest` | `app/backtest/page.tsx` | parquet → core | |
| `/funds` | `app/funds/page.tsx` | funds JSON | `?tab=overview\|watch\|detail\|popular` |

## 셸

- `components/layout/Shell.tsx` — 사이드바 + 상단바(검색칩 + 테마토글) + 도트그리드/광원 배경.
- `components/layout/Sidebar.tsx` / `BottomBar.tsx` — 반응형(216px→72px rail→하단탭바).
- `components/layout/nav.ts` — `NAV` 배열(라우트·아이콘·라벨) 단일 소스.

## 상태 · 훅

| 관심사 | 위치 | 형태 |
|---|---|---|
| 전역 검색(⌘K) | `components/common/TickerSearch.tsx` | zustand `useSearch` |
| 테마(다크/라이트) | `lib/theme.tsx` | zustand `useTheme` + `useChartColors()` |
| 유니버스 로드/필터 | `lib/universe.ts` | `useUniverse()`, `filterUniverse()` |
| 데이터 fetch | `lib/data.ts` | `getBars`/`getUniverse`/`getSectors`/`getFunds*` |
| 로컬 저장 | `lib/db.ts` | idb — SMA설정, 최근검색 |
| 포맷 | `lib/format.ts` | `pct/won/usd/compactEok/ymd/stamp` |

## 차트 컴포넌트

- `components/chart/PriceChart.tsx` — lightweight-charts v5 캔들+거래량(3:1 pane)+SMA. "기본" 모드.
- `components/chart/TradingViewChart.tsx` — TV Advanced Chart 임베드. 토글로 전환하는 옵션(디폴트는 "기본"), 한국 폴백 불가(KRX 임베드 막힘).
- `components/common/TvAttribution.tsx` — TV 무료 위젯의 **출처 표기(약관 조건)**. 위젯을 쓰는 모든 곳에서 함께 렌더한다.
- `lib/tvSymbol.ts` — (market,ticker)→TV 심볼(`KRX:005930` / `AAPL`).
- `components/heatmap/Treemap.tsx` — D3 트리맵(우리 sectors). **2단 드릴다운**: `sector=null` 이면 섹터 단위(클릭 → `onDrill`), 값이 있으면 그 섹터의 구성종목(클릭 → 차트 이동). 한 화면에 전 종목을 펼치면 섹터가 많은 KR 에서 타일이 실오라기가 된다. `components/heatmap/TradingViewHeatmap.tsx` — TV 히트맵 위젯.
- `components/funds/HoldingsHeatmap.tsx` — 펀드 보유종목 트리맵(면적=비중, 색=기간수익률). 섹터 히트맵과 달리 **사전집계본이 없다** — `sectors/*.json` 은 대형주 중심이라 13F 에 흔한 중소형주가 빠진다. 그래서 종목별 parquet 를 브라우저에서 직접 읽어 `rangeReturn` + `PERIOD_LOOKBACK` 으로 계산하고, 종목당 ~100-300KB 라 **비중 0.5% 이상만** 대상으로 한다(동시요청 8개, 받는 대로 점진 렌더).
- `components/heatmap/HeatLegend.tsx`(색 범례) · `components/common/Segment.tsx`(라디오형 토글) · `lib/svgText.ts`(SVG 글자폭 측정·말줄임) — 섹터/펀드 두 히트맵이 공유한다.
- `components/funds/FundPicker.tsx` — 펀드 검색 + 선택 드롭다운(누르면 목록이 펼쳐진다). 상세 화면에서 요약 카드(`FundSummary`) 오른쪽 칸에 놓인다. 검색창은 목록을 좁히고, 입력을 시작하면 목록을 자동으로 편다. 관심 별표는 `leading` 슬롯(테두리 안쪽 왼쪽). 보유내역 로딩과 무관하게 항상 렌더 — 불러오는 동안 사라지면 펀드를 바꿀 수 없다.
- `components/funds/CapMix.tsx` — 보유 종목의 **시가총액 구간** 분포(대형 $10B↑ / 중형 $2–10B / 소형 / 미상). 구간 판정은 `@highprofit/core` 의 `capBand`(`universe.json` 의 `c` 는 억 KRW — 파이프라인이 `USDKRW` 로 환산해 둔 값이라 core 상수도 같아야 한다). 순서는 비중순이 아니라 큰 구간부터 고정. 막대는 `SectorMix` 와 `WeightBars.tsx` 를 공유한다.
- `components/funds/SectorMix.tsx` — 보유 종목을 GICS 섹터로 묶은 비중 막대. 섹터는 `universe.json` 의 `s`(화면이 이미 받아 둔 파일이라 추가 요청 0), 표시 라벨은 `lib/sectorLabel.ts` 로 한글화(데이터는 영문 그대로 둔다). 티커 미매핑·섹터 미제공(지주회사·LP)은 `미분류` 로 모으고, 20% 를 넘으면 이유를 함께 적는다.
- `components/funds/PositionsModal.tsx` — 펀드 **전체** 보유 종목 창. 상세 표는 상위 30 만 보여 주고(그 아래에 "전체 N종목 보기"), 나머지는 여기서 검색·스크롤로 본다. 13F 는 17~7,600종목까지 폭이 넓어 한 번에 안 그리고 스크롤이 바닥에 닿을 때 100행씩 늘린다. 행/표머리는 `components/funds/PositionRow.tsx` 를 두 곳이 공유.
- `components/common/Modal.tsx` — 화면 가운데 뜨는 창(포털, X·Esc·바깥클릭 닫기, 배경 스크롤 잠금, 포커스 복귀). 전체를 채우지 않게 440px × 80vh 로 묶어 두었다. 좁은 칸에 목록을 아래로 펼치는 대신 쓴다(예: `funds/RecentChanges.tsx` 의 "전체 N건 보기").
- `components/seasonality/*`, `components/backtest/*`, `components/funds/Donut.tsx` — Recharts.
- 차트 색은 **`useChartColors()`** 로 테마 연동(하드코딩 hex 금지).

## 스타일 (디자인 시스템)

- Tailwind v4 `@theme` 토큰 in `app/globals.css`. 다크 기본 + `:root[data-theme="light"]` 오버라이드.
- 토큰만 바꾸면 전 탭 전환(카드가 `bg-surface`/`border-line`/`text-accent` 사용).
- **초록/빨강은 손익 방향 전용**, UI 강조는 페리윙클(`--color-accent`).
- 글래스: `.panel`, 배경: `.dot-grid`/`.aura`, 상호작용: `.glow-hover`, 숫자: `.num`(JetBrains Mono, tabular).
- 폰트: Hanken Grotesk(라틴) + IBM Plex Sans KR(한글 폴백) + JetBrains Mono(숫자).

## 정적 export 제약

- 서버 컴포넌트에서 런타임 fetch 금지. `useSearchParams` 쓰는 페이지는 `<Suspense>` 필요(chart/heatmap 참고).
- TV 위젯은 클라이언트에서 컨테이너 div 에 `<script>` 주입(테마/심볼 변경 시 재주입).
