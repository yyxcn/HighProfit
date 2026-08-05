# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`pipeline/` — Python 배치 수집. 시세·펀드를 모아 **정적 파일(parquet+json)** 로 내보내고 R2(또는 로컬
`apps/web/public/data`)에 올린다. 웹앱과 독립. 레포 전체 규칙은 `../CLAUDE.md`, 스키마는 `../docs/data-schema.md`.

## Critical Rules (절대 규칙)

- **항상 모듈 형식으로 실행**: `python -m pipeline.<pkg>.<script>` (패키지 상대 import). 파일 직접 실행 금지.
- **출력 위치는 env `HP_DATA_DIR`** (기본 `repo/data`). 로컬 웹 확인은 `apps/web/public/data` 로 지정.
- **parquet 는 snappy 압축 고정** — hyparquet(브라우저 리더)가 zstd 미지원. `lib/io.py:write_ohlcv` 만 통해 쓴다.
- **수정주가로 저장** — yfinance `auto_adjust=True`, pykrx `adjusted=True`. 미반영 시 계절성·백테스트 오염.
- **섹터 수익률 = 시총가중 평균**(단순평균 금지). 빈 결과로 R2 정상 파일을 덮지 않는다(가드 있음).
- **SEC EDGAR 는 `SEC_USER_AGENT` 필수**, 초당 <10요청. 휴장일이면(최신 봉 == 직전) 업로드 스킵.
- pykrx/yfinance 는 **개인·비상업 전제** — 상업/트래픽 시 유료 데이터나 증권사 OpenAPI(KIS 등)로 교체.

## Architecture

```
pipeline/
├── lib/io.py               # ★ parquet(snappy)/json 쓰기, meta.json 갱신, R2(S3) 클라이언트, 경로 상수
├── daily/                  # 일간 (GitHub Actions daily-kr/daily-us)
│   ├── fetch_kr.py         # pykrx KR 수집 — 이 환경 KRX 차단(로그인 요구)
│   ├── fetch_us.py         # yfinance US 수집
│   ├── build_universe.py   # universe_kr + universe_us → universe.json
│   ├── build_sectors.py    # 시총가중 섹터 집계 (--enrich-kr: pykrx 업종 보강)
│   ├── upload_r2.py        # R2 동기화 (etag 미변경 스킵)
│   └── sync_down.py        # R2→로컬 (교차 워크플로 병합/스킵판정)
├── quarterly/fetch_13f.py  # SEC EDGAR 13F 파싱, cusip→ticker, 전분기 대비 변화
├── dev/                    # 우회·초기적재 (pykrx 막힘 대응 / 대량수집)
│   ├── make_sample.py      # 합성 데이터(외부 API 불필요, e2e 검증) — --publish 로 public/data
│   ├── build_full_universe.py  # KIND(KR) + nasdaqtrader(US) 전종목 검색 인덱스
│   ├── fetch_kr_yf.py      # yfinance .KS/.KQ 로 KR 전종목 OHLCV
│   ├── fetch_us_all.py     # yfinance US 전종목 OHLCV
│   └── expand_us.py        # S&P500(위키) + 시총(slickcharts)
├── config/                 # us_universe.csv, funds.csv, cusip_map.csv
└── requirements.txt        # pandas, pyarrow, yfinance, requests, boto3 (+pykrx)
```

## Data Sources

| 소스 | 용도 | 상태 |
|---|---|---|
| pykrx | KR 시세(원래 지정) | ❌ KRX 차단 |
| KRX KIND | KR 종목목록(이름·코드·시장·업종) | ✅ 무료 |
| yfinance | US + KR 시세(`.KS`/`.KQ`) | ✅ (시총 quote 는 막힘) |
| 네이버 금융 | KR 시총(종목명 매칭) | ✅ |
| slickcharts | S&P500 지수비중(시총 프록시) | ✅ |
| SEC EDGAR | 13F | ✅ (UA 필수) |

## Commands

```bash
python3.13 -m venv .venv && .venv/bin/pip install -r requirements.txt   # (시스템에 3.12 없음)
# 아래는 repo 루트에서 실행:
export HP_DATA_DIR=$PWD/apps/web/public/data
pipeline/.venv/bin/python -m pipeline.dev.make_sample --publish         # 로컬 샘플(외부 API 불필요)
pipeline/.venv/bin/python -m pipeline.dev.fetch_kr_yf --limit 200       # KR 실수집(테스트)
SEC_USER_AGENT="HighProfit you@x.com" \
  pipeline/.venv/bin/python -m pipeline.quarterly.fetch_13f --limit 1   # 13F(테스트)
```

## Note

현 로컬 데이터는 **자동 갱신 아님**(수동 스냅샷). 매일 갱신하려면 launchd/cron 또는 GitHub Actions(R2+secrets) 필요.
