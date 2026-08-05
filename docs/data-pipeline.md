# Data Pipeline

`pipeline/` — Python 3.13 venv(`pipeline/.venv`). 항상 모듈 형식으로 실행:
`python -m pipeline.<pkg>.<script>`. 출력 위치는 env `HP_DATA_DIR`(기본 `repo/data`).

## 데이터 소스

| 소스 | 용도 | 상태 |
|---|---|---|
| **pykrx** | KR 시세(원래 지정) | ❌ 이 환경 KRX 차단(로그인 요구) |
| **KRX KIND** | KR 종목목록(이름·코드·시장·업종) | ✅ 무료 공개 |
| **yfinance** | US + KR 시세(`.KS`/`.KQ`로 우회) | ✅ (시총 quote 는 막힘) |
| **네이버 금융** | KR 시총 | ✅ 종목명 매칭 |
| **slickcharts** | S&P500 지수비중(시총 프록시) | ✅ |
| **SEC EDGAR** | 13F 보유내역 | ✅ User-Agent 필수 |

> pykrx/yfinance 는 개인·비상업 전제. 상업/트래픽 시 유료 데이터 또는 증권사 OpenAPI(KIS 등)로 교체.

## 스크립트

- `pipeline/lib/io.py` — parquet(**snappy**)/json 쓰기, `meta.json` 갱신, R2(S3호환) 클라이언트, 경로 상수.
- `daily/fetch_kr.py`(pykrx, 현재 막힘) · `daily/fetch_us.py`(yfinance) · `daily/build_universe.py` · `daily/build_sectors.py`(시총가중, cap≤0 제외) · `daily/upload_r2.py` · `daily/sync_down.py`.
- `quarterly/fetch_13f.py` — EDGAR 13F 파싱, cusip→ticker, 전분기 대비 신규/증가/감소/청산.
- `dev/` (실운용 우회·초기적재):
  - `make_sample.py` — 합성 데이터 생성(외부 API 불필요, e2e 검증용).
  - `build_full_universe.py` — KIND+nasdaqtrader 전종목 검색 인덱스.
  - `fetch_kr_yf.py` / `fetch_us_all.py` — yfinance 전종목 OHLCV(대량, 청크).
  - `expand_us.py` — S&P500 + 시총.

## 로컬 개발 데이터

외부 API/R2 없이:
```bash
python3.13 -m venv pipeline/.venv && pipeline/.venv/bin/pip install -r pipeline/requirements.txt
pipeline/.venv/bin/python -m pipeline.dev.make_sample --publish   # → apps/web/public/data
```
`data/` 와 `apps/web/public/data/` 는 gitignore(산출물).

## 배치(cron)

`.github/workflows/daily-kr.yml`(07:30 UTC) · `daily-us.yml`(22:00 UTC) · `quarterly-13f.yml`.
휴장일이면(최신 봉이 직전과 동일) 업로드 스킵. 프로덕션은 R2 + secrets 필요.
**현 로컬 데이터는 자동 갱신 아님(수동 스냅샷).** 매일 갱신하려면 launchd/cron 또는 Actions 필요.

스키마: [data-schema.md](data-schema.md)
