# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`apps/web` — HighProfit 프론트엔드(Next.js 16 App Router, 정적 export). 레포 전체 규칙은
루트 `../CLAUDE.md`, 상세 문서는 `../docs/*.md` 참조. 이 파일은 **웹앱 작업**에 필요한 것만 담는다.

## ⚠️ Next 16 주의

Next 관련 코드를 쓰기 전 `node_modules/next/dist/docs/` 의 해당 가이드를 확인한다. 학습 데이터와 API가 다를 수 있다.

## Commands (apps/web 기준)

```bash
npm run dev            # dev 서버 (localhost:3000)
npm run build          # next build → 정적 out/ 생성 (output:'export')
npm run lint           # eslint
npm run start          # 빌드 미리보기

# core 순수 함수 테스트는 이 워크스페이스에 없다 — 레포 루트에서:
#   (cd .. && npm run test)                                  # 전체
#   (cd .. && npm run test -w @highprofit/core -- -t "이름")  # 단일
```

## Critical Rules

- **`output: 'export'` (next.config.ts) 가 기본** — 데이터는 전부 클라이언트에서 `lib/data.ts` 로 fetch 한다.
  서버가 필요한 기능은 **별도 서비스**(Cloudflare Worker 등, `services/<name>/`)로 빼고 `lib/data.ts` 에
  fetch 함수를 추가하는 방식이 우선 — 정적 JSON이든 서비스 URL이든 진입점이 한 곳이면 갈아타는 비용이 없다.
  `output: 'export'` 해제(SSR·API Routes)는 Capacitor 경로를 포기하는 결정이라 확인 후에만.
- **`useSearchParams` 쓰는 페이지는 `<Suspense>` 로 감싼다** (예: `app/chart/page.tsx`, `app/heatmap/page.tsx`). 안 그러면 export 빌드가 실패한다.
- **모든 데이터 fetch 는 `lib/data.ts` 를 통해서만.** 컴포넌트에서 직접 `fetch` 하지 않는다.
- **차트 색은 `lib/theme.tsx` 의 `useChartColors()` 로.** hex 하드코딩 금지(다크/라이트 깨짐).
- **초록/빨강은 손익 방향 전용**, UI 강조는 `text-accent`(페리윙클). 숫자는 `.num` 클래스.
- **TradingView 위젯엔 `<TvAttribution />` 을 반드시 함께 렌더** — 무료 위젯의 출처 표기는 TV 약관 조건이다.
- `@highprofit/core` 는 `transpilePackages` 로 소비 — 계산 로직은 여기에 두지 말고 core 에 둔다.

## Architecture

```
apps/web/
├── app/                        # App Router (정적 export)
│   ├── layout.tsx              # 폰트 + 테마 무플래시 스크립트 + <Shell>
│   ├── page.tsx                # 메인 랜딩 (히어로 계절성 곡선 + bento 카드)
│   ├── globals.css             # Tailwind v4 @theme 토큰 (다크 + data-theme="light")
│   ├── chart/page.tsx          # 차트 탭 — TV위젯/우리일봉 토글, ?m=&t=, <Suspense>
│   ├── heatmap/page.tsx        # 히트맵 탭 — TV위젯/D3트리맵 토글, ?m=&p=, <Suspense>
│   ├── seasonality/page.tsx    # 계절성 탭 — core.seasonality + 정직성 지표
│   ├── backtest/page.tsx       # 백테스팅 탭 — core.backtest + 프리셋
│   └── funds/page.tsx          # 펀드 탭 — 13F 보유·전분기 변화
├── components/
│   ├── layout/                 # Shell, Sidebar, BottomBar, nav.ts(라우트 단일소스)
│   ├── common/                 # TickerSearch(⌘K, zustand useSearch), SecurityPicker, StatCard, EmptyState
│   ├── chart/                  # PriceChart(lightweight-charts v5), TradingViewChart(임베드), SmaPanel
│   ├── heatmap/                # Treemap(D3-hierarchy), TradingViewHeatmap(임베드)
│   ├── seasonality/            # SeasonalityChart, MonthlyBars (Recharts)
│   ├── backtest/               # EquityChart, YearlyBars (Recharts)
│   ├── funds/Donut.tsx         # 보유 비중 도넛
│   └── home/HeroCurve.tsx      # SVG 계절성 곡선 (stroke 애니메이션)
├── lib/
│   ├── data.ts                 # ★ 유일한 fetch 게이트 (parquet→hyparquet, json, 캐시+재시도)
│   ├── db.ts                   # IndexedDB (SMA 설정, 최근 검색)
│   ├── universe.ts             # useUniverse + filterUniverse (universe.json 1회 로드→클라 필터)
│   ├── theme.tsx               # useTheme(다크/라이트) + useChartColors() + ThemeToggle
│   ├── tvSymbol.ts             # (market,ticker)→TradingView 심볼 (KRX:005930 / AAPL)
│   ├── format.ts               # pct/won/usd/compactEok/ymd/stamp
│   └── utils.ts                # cn()
├── public/data/                # 로컬 데이터 (gitignore) — R2 버킷 미러
└── next.config.ts              # output:'export', transpilePackages:['@highprofit/core']
```

핵심 흐름: 검색(⌘K)→`router.push('/chart?m=&t=')`→페이지가 `lib/data.ts`로 fetch→`@highprofit/core` 계산→차트.
차트/히트맵은 "실시간(TV)↔기본" 토글. KRX 는 TV 임베드가 불가해서 **차트는 KR 이면 기본 모드로 자동 전환**
(`chart/page.tsx`). 히트맵은 그 분기가 없어 항상 TV 가 기본이고, TV 소스가 전부 미국이라 한국은 직접 "기본"으로 바꿔야 한다.
세부: `../docs/frontend-architecture.md`, 스키마 `../docs/data-schema.md`.

## Conventions

- 컴포넌트는 도메인 폴더(`components/<chart|heatmap|seasonality|backtest|funds|common|layout|home>/`).
- 라우트 정의는 `components/layout/nav.ts` 단일 소스.
- 포맷은 `lib/format.ts`(`pct/won/usd/compactEok/ymd/stamp`), 클래스 병합은 `lib/utils.ts` `cn()`.
- 빈 화면은 `components/common/EmptyState.tsx`(행동 유도), 로딩은 스켈레톤/pulse.
- `public/data/` 는 gitignore — `HP_DATA_DIR=./apps/web/public/data` 로 `pipeline.daily.*` 재수집.
