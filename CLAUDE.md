# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**HighProfit** — 개인용 투자 분석 대시보드. 시세는 배치로 수집해 정적 파일(parquet+json)로
배포하고, 모든 분석(차트·히트맵·계절성·백테스트·13F)은 브라우저에서 계산한다. 현재 DB·API 서버·로그인 없이
운영비 0원(필요해지면 별도 서비스로 붙인다), 나중에 PWA→Capacitor 로 앱 포장 가능한 구조.
탭 5개: 차트 / 히트맵 / 계절성 / 백테스팅 / 펀드.

## Critical Rules (절대 규칙)

- **`apps/web` 은 `output: 'export'` 가 기본** — Capacitor 포장·운영비 0원이 여기 걸려 있다. 서버 로직이
  필요하면 **별도 서비스**(Cloudflare Worker 등, `services/<name>/`)로 분리하고 웹앱은 정적으로 둔다.
  `output: 'export'` 해제(Next SSR·API Routes)는 Capacitor 경로를 포기하는 결정이므로 임의로 하지 말고 먼저 확인받는다.
- **`packages/core` 에 React/DOM/Next import 금지** — 순수 함수만. 새 함수는 반드시 손검증 케이스로 vitest 작성.
- **모든 데이터 fetch 는 `apps/web/lib/data.ts` 하나로** — `getBars`가 parquet 를 hyparquet 로 읽음.
- **parquet 는 snappy 압축 고정** — hyparquet(브라우저 리더)가 zstd 미지원. `pipeline/lib/io.py` 참고.
- **날짜는 전부 `'YYYY-MM-DD'` 문자열** — Date 객체를 계산 로직에 흘리지 않는다(타임존 사고 방지).
- **초록/빨강은 손익 방향에만** — UI 강조는 페리윙클(`--color-accent`). 차트 색은 `useChartColors()`(하드코딩 hex 금지).
- **수수료·세율은 `packages/core/src/fees.ts` 한 곳에만**(시행일 주석 필수).
- **커밋은 명시적으로 요청받기 전엔 하지 않는다.** 로컬 git, 원격 없음.

## Architecture

전체 디렉터리 트리·데이터 흐름은 **[docs/architecture.md](docs/architecture.md)** 참조. 요지:

```
HighProfit/
├── apps/web/        # Next 16 App Router (output:export) — 5 탭 + lib/data.ts 게이트
├── packages/core/   # React 의존성 0. 순수 함수 + vitest 38
├── pipeline/        # Python 수집·집계·업로드 (python -m pipeline.…)
└── .github/workflows/  # daily-kr / daily-us / quarterly-13f (cron)
```

단방향: `pipeline` → parquet+json(R2/`public/data`) → `lib/data.ts` → `@highprofit/core` → 탭 UI.

## Tech Stack

- **프론트**: Next.js 16 App Router(정적 export), React 19, TypeScript strict
- **스타일**: Tailwind v4(`@theme` 토큰, 다크/라이트), Hanken Grotesk + IBM Plex Sans KR + JetBrains Mono
- **차트**: lightweight-charts v5(캔들), Recharts(통계), D3-hierarchy(트리맵), TradingView 임베드 위젯(실시간)
- **상태/저장**: zustand, idb(IndexedDB), hyparquet(브라우저 parquet)
- **core**: 순수 TS + vitest
- **파이프라인**: Python 3.13 (yfinance, pandas, pyarrow, requests, boto3, lxml). KR/US 모두 yfinance
- **패키지매니저**: **npm workspaces** (pnpm 아님). 저장소: R2. 배치: GitHub Actions. 호스팅: Vercel.

## Build & Test Commands

```bash
npm install                                  # 워크스페이스 전체
npm run dev                                  # apps/web dev (localhost:3000)
npm run build                                # core 타입체크 → web 정적 빌드 (둘 다 통과해야 함)
npm run lint                                  # = eslint (apps/web)
npm run test                                 # = core vitest
npm run test -w @highprofit/core -- __tests__/backtest.test.ts   # 단일 파일
npm run test -w @highprofit/core -- -t "50:50"                   # 이름 필터
npm run build -w @highprofit/core            # tsc --noEmit 타입체크만

# Python 파이프라인 (python -m 형식으로 실행, HP_DATA_DIR 로 출력경로 지정)
python3.13 -m venv pipeline/.venv && pipeline/.venv/bin/pip install -r pipeline/requirements.txt
export HP_DATA_DIR=./apps/web/public/data                         # 로컬 수집 대상
pipeline/.venv/bin/python -m pipeline.daily.fetch_kr              # KR (yfinance .KS/.KQ)
```

## Domain Context

- **수정주가(adjusted close)** — 분할·배당 반영. 액면분할 미반영 시 계절성·백테스트가 오염됨.
- **계절성** — 로그수익률을 MM-DD 그룹핑, `exp(로그평균)`으로 기하평균 경로. `|tStat|<2`는 노이즈(회색 처리).
- **백테스트** — 공통 거래일 inner join(KR/US 휴장일 상이), 리밸런싱 비용 `0.5×Σ|Δ|×costRate`, 미국은 달러 기준.
- **히트맵** — 섹터 수익률 = 구성종목 **시총가중 평균**(단순평균 금지). 기간별 색 클램핑(`CLAMP`).
- **13F** — 45일 지연·롱온리·참고용. 전분기 대비 신규/증가/감소/청산.
- **KRX TradingView 제약** — KRX 데이터는 TV 무료 임베드에 안 뜸(라이선스) → 한국은 우리 일봉, 미국은 TV 실시간.

## Coding Conventions

- 숫자 표시는 `.num` 클래스(JetBrains Mono, tabular) + `lib/format.ts` 유틸로 통일.
- 카드/패널은 `.panel`(글래스), 강조 `text-accent`, 배경 토큰 `bg-surface`/`border-line`.
- `useSearchParams` 쓰는 페이지는 `<Suspense>` 필요(정적 export). 예: `app/chart/page.tsx`.
- 컴포넌트는 관심사별 폴더(`components/<domain>/`), 라우트 정의는 `components/layout/nav.ts` 단일 소스.
- 파이프라인 산출물(`data/`, `apps/web/public/data/`)은 gitignore — `pipeline.daily.*` 로 재수집.
- Next 16 은 브레이킹 체인지 있음 — Next 코드 전 `apps/web/node_modules/next/dist/docs/` 확인(`apps/web/AGENTS.md`).

## Key Patterns

- **단일 데이터 게이트** — 모든 fetch 는 `lib/data.ts`(메모리 캐시 + 재시도 1회, `no-cache` 재검증).
- **종목당 parquet 1파일** — `ohlcv/{market}/{ticker}.parquet`, 열 때 ~100KB만 다운로드.
- **사전집계** — 섹터/펀드는 파이프라인에서 계산(브라우저가 전종목 집계 불가).
- **테마 연동 차트** — `useChartColors()`로 다크/라이트 색 주입, TradingView 위젯은 테마 변경 시 재주입.
- **모드 토글** — 차트·히트맵은 "실시간(TV) ↔ 기본(우리 데이터)" 토글. **차트만** 시장별 기본값이
  다르고(KR→기본, US→TV), 히트맵은 항상 TV 가 기본이다(TV 소스가 전부 미국이라 한국은 기본 모드로 전환해야 보인다).
- **URL 계약** — 차트 `?m=&t=`, 히트맵 `?m=&p=` (공유·검색 라우팅).

## Reference Docs

- `docs/architecture.md` — 전체 디렉터리 트리 + 데이터 흐름
- `docs/frontend-architecture.md` — 라우트, 컴포넌트, 훅, 스타일/테마, 차트
- `docs/core-api.md` — `@highprofit/core` 순수 함수 레퍼런스
- `docs/data-pipeline.md` — Python 수집 스크립트, 데이터 소스, cron
- `docs/data-schema.md` — R2 레이아웃 + parquet/json 스키마
