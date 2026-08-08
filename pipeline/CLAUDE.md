# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`pipeline/` — Python 배치 수집. 시세·펀드를 모아 **정적 파일(parquet+json)** 로 내보내고 R2(또는 로컬
`apps/web/public/data`)에 올린다. 웹앱과 독립. 레포 전체 규칙은 `../CLAUDE.md`, 스키마는 `../docs/data-schema.md`.

## Critical Rules (절대 규칙)

- **항상 모듈 형식으로 실행**: `python -m pipeline.<pkg>.<script>` (패키지 상대 import). 파일 직접 실행 금지.
- **출력 위치는 env `HP_DATA_DIR`** (기본 `repo/data`). 로컬 웹 확인은 `apps/web/public/data` 로 지정.
- **parquet 는 snappy 압축 고정** — hyparquet(브라우저 리더)가 zstd 미지원. `lib/io.py:write_ohlcv` 만 통해 쓴다.
- **수정주가로 저장** — yfinance `auto_adjust=True`. 미반영 시 계절성·백테스트 오염.
- **증분 수집이 기본** — 기존 parquet 뒤에 최근 구간만 붙인다. 분할이 나면 야후가 과거를 재계산하므로 겹치는 구간 종가를 비교해 어긋나면 그 종목만 전량 재수집(`lib/yfetch.py`).
- **섹터 수익률 = 시총가중 평균**(단순평균 금지). 빈 결과로 R2 정상 파일을 덮지 않는다(가드 있음).
- **SEC EDGAR 는 `SEC_USER_AGENT` 필수**, 초당 <10요청. 휴장일이면(최신 봉 == 직전) 업로드 스킵.
- **KR 시세·시총·섹터는 전부 yfinance 로 받는다** — 거래소 사이트를 직접 긁는 라이브러리는 도입하지 않는다(이력이 짧고 사이트 구조 변경에 취약). 다른 소스를 섞지 말 것.
- yfinance 는 **개인·비상업 전제** — 상업/트래픽 시 유료 데이터나 증권사 OpenAPI(KIS 등)로 교체.

## Architecture

```
pipeline/
├── lib/io.py               # ★ parquet(snappy)/json 쓰기, meta.json 갱신, R2(S3) 클라이언트, 경로 상수
├── daily/                  # 일간 (GitHub Actions daily-kr/daily-us)
│   ├── fetch_kr.py         # yfinance KR 수집 (.KS/.KQ) — lib/yfetch.py 공유
│   ├── fetch_us.py         # yfinance US 수집
│   ├── build_universe.py   # universe_kr + universe_us → universe.json
│   ├── build_sectors.py    # 시총가중 섹터 집계 (universe.json 을 읽으므로 build_universe 뒤에)
│   ├── upload_r2.py        # R2 동기화 (etag 미변경 스킵)
│   └── sync_down.py        # R2→로컬 (교차 워크플로 병합/스킵판정)
├── quarterly/fetch_13f.py  # SEC EDGAR 13F 파싱, cusip→ticker, 전분기 대비 변화
├── dev/                    # 초기적재·대량수집 (손으로 실행. Actions 는 안 씀)
│   ├── build_full_universe.py  # KIND(KR) + nasdaqtrader(US) 전종목 검색 인덱스(비주식 제외)
│   └── enrich_meta.py       # KR/US 시총·섹터 보강 (Ticker.info, 거래대금 상위 2000만)
├── config/                 # funds.csv, cusip_map.csv
└── requirements.txt        # pandas, pyarrow, yfinance, requests, boto3, lxml (30개 핀)
```

## Data Sources

| 소스 | 용도 | 상태 |
|---|---|---|
| KRX KIND | KR 종목목록(이름·코드·시장·업종) | ✅ 무료·로그인 불필요 |
| nasdaqtrader | US 전종목 심볼 디렉터리 | ✅ 무료 |
| yfinance | US 시세 + `Ticker.info`(시총·섹터, ETF 는 `totalAssets`·`category`) | ✅ 대량 구간 throttle 있음 |
| SEC EDGAR | 13F | ✅ (UA 필수) |

## Commands

```bash
python3.13 -m venv .venv && .venv/bin/pip install -r requirements.txt   # (시스템에 3.12 없음)
# 아래는 repo 루트에서 실행:
export HP_DATA_DIR=$PWD/apps/web/public/data
pipeline/.venv/bin/python -m pipeline.daily.fetch_kr --tickers 005930   # KR 실수집(테스트)
SEC_USER_AGENT="HighProfit you@x.com" \
  pipeline/.venv/bin/python -m pipeline.quarterly.fetch_13f --limit 1   # 13F(테스트)
```

## Note

현 로컬 데이터는 **자동 갱신 아님**(수동 스냅샷). 매일 갱신하려면 launchd/cron 또는 GitHub Actions(R2+secrets) 필요.
