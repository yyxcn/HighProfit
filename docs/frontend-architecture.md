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
| `/funds` | `app/funds/page.tsx` | funds JSON | |

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
- `components/chart/TradingViewChart.tsx` — TV Advanced Chart 임베드. 미국 기본, 한국 폴백 불가(KRX 임베드 막힘).
- `components/common/TvAttribution.tsx` — TV 무료 위젯의 **출처 표기(약관 조건)**. 위젯을 쓰는 모든 곳에서 함께 렌더한다.
- `lib/tvSymbol.ts` — (market,ticker)→TV 심볼(`KRX:005930` / `AAPL`).
- `components/heatmap/Treemap.tsx` — D3 트리맵(우리 sectors). **2단 드릴다운**: `sector=null` 이면 섹터 단위(클릭 → `onDrill`), 값이 있으면 그 섹터의 구성종목(클릭 → 차트 이동). 한 화면에 전 종목을 펼치면 섹터가 많은 KR 에서 타일이 실오라기가 된다. `components/heatmap/TradingViewHeatmap.tsx` — TV 히트맵 위젯.
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
