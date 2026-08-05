# Architecture

서버 없는 정적 배포. 시세는 배치로 수집→정적 파일(parquet+json), 모든 분석은 브라우저에서
`@highprofit/core` 순수 함수로 계산. DB·API 서버·로그인 없음.

## 디렉터리 트리

```
HighProfit/
├── apps/web/                       # Next.js 16 App Router · output:'export' (정적)
│   ├── app/
│   │   ├── layout.tsx              # 폰트 + 테마 무플래시 스크립트 + Shell
│   │   ├── page.tsx                # 메인 랜딩 (히어로 계절성 곡선 + bento)
│   │   ├── chart/page.tsx          # 차트 탭 — TV위젯(미국)/우리일봉(한국) 토글, ?m=&t=
│   │   ├── heatmap/page.tsx        # 히트맵 탭 — TV위젯/D3트리맵 토글, ?m=&p=
│   │   ├── seasonality/page.tsx    # 계절성 탭 — core.seasonality + 정직성 지표
│   │   ├── backtest/page.tsx       # 백테스팅 탭 — core.backtest + 프리셋
│   │   └── funds/page.tsx          # 펀드 탭 — 13F 보유·전분기 변화
│   ├── components/
│   │   ├── layout/                 # Shell, Sidebar, BottomBar, nav.ts(라우트 단일소스)
│   │   ├── common/                 # TickerSearch(⌘K), SecurityPicker, StatCard, EmptyState
│   │   ├── chart/                  # PriceChart(lightweight-charts), TradingViewChart, SmaPanel
│   │   ├── heatmap/                # Treemap(D3), TradingViewHeatmap
│   │   ├── seasonality/            # SeasonalityChart, MonthlyBars (Recharts)
│   │   ├── backtest/               # EquityChart, YearlyBars (Recharts)
│   │   ├── funds/Donut.tsx         # 보유 비중 도넛
│   │   └── home/HeroCurve.tsx      # SVG 계절성 곡선 (stroke 애니메이션)
│   ├── lib/
│   │   ├── data.ts                 # ★ 유일한 fetch 게이트 (parquet/json, 캐시+재시도)
│   │   ├── db.ts                   # IndexedDB (SMA설정, 최근검색)
│   │   ├── universe.ts             # useUniverse + filterUniverse (클라이언트 검색)
│   │   ├── theme.tsx               # useTheme(다크/라이트) + useChartColors()
│   │   ├── tvSymbol.ts             # (market,ticker)→TradingView 심볼
│   │   ├── format.ts               # pct/won/usd/compactEok/ymd/stamp
│   │   └── utils.ts                # cn()
│   ├── public/data/                # 로컬 데이터(gitignore) — R2 버킷 미러
│   └── next.config.ts              # output:'export', transpilePackages:['@highprofit/core']
│
├── packages/core/                  # ★ React 의존성 0. 순수 함수 + vitest
│   ├── src/
│   │   ├── types.ts                # Bar, UniverseItem, Sector, Meta …
│   │   ├── returns.ts              # sma, simple/log returns
│   │   ├── metrics.ts              # CAGR/MDD/Sharpe/Sortino/Calmar/drawdownPeriods
│   │   ├── seasonality.ts          # 로그수익률 기반 계절성 경로
│   │   ├── backtest.ts             # 리밸런싱·거래비용·inner join 백테스트
│   │   ├── heatmap.ts              # 기간별 클램핑 색 보간, 시총가중
│   │   ├── fees.ts                 # 수수료·세율 상수(시행일 주석)
│   │   └── index.ts                # 배럴 export
│   └── __tests__/                  # vitest 34 (손검증 케이스 포함)
│
├── pipeline/                       # Python 3.13 — python -m pipeline.<pkg>.<script>
│   ├── lib/io.py                   # parquet(snappy)/json 쓰기, meta, R2(S3) 클라이언트
│   ├── daily/
│   │   ├── fetch_kr.py             # pykrx KR 수집 (이 환경 KRX 차단)
│   │   ├── fetch_us.py             # yfinance US 수집
│   │   ├── build_universe.py       # KR+US 병합 → universe.json
│   │   ├── build_sectors.py        # 시총가중 섹터 집계 (--enrich-kr)
│   │   ├── upload_r2.py            # R2 동기화 (etag 미변경 스킵)
│   │   └── sync_down.py            # R2→로컬 (교차 워크플로 병합)
│   ├── quarterly/fetch_13f.py      # SEC EDGAR 13F 파싱
│   ├── dev/                        # 우회·초기적재
│   │   ├── make_sample.py          # 합성 데이터(외부API 불필요)
│   │   ├── build_full_universe.py  # KIND+nasdaqtrader 전종목 검색인덱스
│   │   ├── fetch_kr_yf.py          # yfinance .KS/.KQ 로 KR 전종목
│   │   ├── fetch_us_all.py         # yfinance US 전종목
│   │   └── expand_us.py            # S&P500 + 시총
│   └── requirements.txt
│
├── .github/workflows/              # daily-kr / daily-us / quarterly-13f (cron)
└── docs/                           # 아래 Reference Docs
```

## 단방향 데이터 흐름

`pipeline`(수집·집계) → `parquet+json`(R2 또는 `public/data`) → `lib/data.ts`(유일한 게이트) →
`@highprofit/core`(계산) → 탭 UI(lightweight-charts·Recharts·D3). 개인 데이터는 `lib/db.ts`(IndexedDB).
차트·히트맵은 TradingView 임베드 위젯으로 실시간 제공(단 KRX 는 임베드 불가 → 우리 일봉).

세부: [frontend-architecture.md](frontend-architecture.md) · [data-pipeline.md](data-pipeline.md) · [data-schema.md](data-schema.md)
