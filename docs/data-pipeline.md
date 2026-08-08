# Data Pipeline

`pipeline/` — Python 3.13 venv(`pipeline/.venv`). 항상 모듈 형식으로 실행:
`python -m pipeline.<pkg>.<script>`. 출력 위치는 env `HP_DATA_DIR`(기본 `repo/data`).

## 데이터 소스

| 소스 | 용도 | 상태 |
|---|---|---|
| **KRX KIND** | KR 종목목록(이름·코드·시장·업종) | ✅ 무료 공개·로그인 불필요 |
| **nasdaqtrader** | US 전종목 심볼 디렉터리 | ✅ 무료 공개 |
| **yfinance** | **KR/US** 시세(`.KS`/`.KQ`) + `Ticker.info`(시총·GICS 섹터) | ✅ 대량 구간 throttle 있음 |
| **SEC EDGAR** | 13F 보유내역 | ✅ User-Agent 필수 |

> yfinance 는 개인·비상업 전제. 상업/트래픽 시 유료 데이터 또는 증권사 OpenAPI(KIS 등)로 교체.
> 거래소 사이트를 직접 긁는 라이브러리는 쓰지 않는다 — 이력이 짧고 사이트 구조 변경에 취약하다.
> 한국 공식 경로가 필요하면 [openapi.krx.co.kr](https://openapi.krx.co.kr)(인증키, 2010년~).

## 스크립트

- `pipeline/lib/io.py` — parquet(**snappy**)/json 쓰기, `meta.json` 갱신, R2(S3호환) 클라이언트, 경로 상수.
- `lib/yfetch.py` — yfinance 청크 수집 공통(KR/US 공유). `daily/fetch_kr.py`(`.KS`/`.KQ`) · `daily/fetch_us.py` 는 대상 목록만 정해 넘기는 얇은 래퍼 · `daily/build_universe.py` · `daily/build_sectors.py`(시총가중, cap≤0 제외) · `daily/upload_r2.py` · `daily/sync_down.py`.
- `quarterly/fetch_13f.py` — EDGAR 13F 파싱, cusip→ticker, 전분기 대비 신규/증가/감소/청산.
- `dev/` (초기적재·대량수집. 손으로 실행하며 Actions 는 쓰지 않는다):
  - `build_full_universe.py` — KIND+nasdaqtrader 전종목 검색 인덱스. 워런트·권리증서·SPAC 유닛·우선주·채권 제외(약 1,546건). **MLP 의 `Common Units` 와 ADR 은 정상 지분이라 유지**. KR 섹터는 여기서 채우지 않고 `기타` 로 두고 `enrich_meta` 가 GICS 로 채운다.
  - `enrich_meta.py` — **KR/US** 시총·섹터 보강(`--market`). 주식은 `marketCap`+GICS 매핑, ETF 는 `totalAssets`+`category`. **거래대금 상위 2000종목만**(`--top`) 채운다 — 아래 "시총·섹터를 전종목에 채우지 않는 이유" 참고.

## 로컬 개발 데이터

R2 없이 `apps/web/public/data` 에 직접 수집한다(`upload_r2` 생략):
```bash
python3.13 -m venv pipeline/.venv && pipeline/.venv/bin/pip install -r pipeline/requirements.txt
export HP_DATA_DIR=$PWD/apps/web/public/data
pipeline/.venv/bin/python -m pipeline.dev.build_full_universe   # 종목 인덱스
pipeline/.venv/bin/python -m pipeline.daily.fetch_kr
pipeline/.venv/bin/python -m pipeline.daily.fetch_us
pipeline/.venv/bin/python -m pipeline.dev.enrich_meta --market all
pipeline/.venv/bin/python -m pipeline.daily.build_universe      # build_sectors 보다 먼저
pipeline/.venv/bin/python -m pipeline.daily.build_sectors
```
`data/` 와 `apps/web/public/data/` 는 gitignore(산출물).

> `daily.fetch_us` 는 `universe_us.json` 을 **대상 목록으로 읽기만** 한다(쓰지 않음).
> 목록 관리는 `dev/build_full_universe.py`, 시총·섹터는 `dev/enrich_meta.py` 담당 — 셋이 서로 덮어쓰지 않는다.

### 실측 소요 시간 (2026-08-09, 전량 재수집 기준)

| 단계 | 종목 | 소요 |
|---|---|---|
| `dev.build_full_universe` | — | 5초 |
| `daily.fetch_kr` | 2,703 | **5분** (전량 재수집) |
| `daily.fetch_us` | 11,534 | **4시간 2분** |
| `dev.enrich_meta --market KR --top 0` | 2,703 | 20분 |
| `build_sectors` + `build_universe` | — | 2분 |

`fetch_us` 는 60종목씩 청크로 받는데도 오래 걸린다 — 야후가 대량 구간에서 throttle 해
**1.26초/종목**까지 떨어진다(20종목 샘플에서는 0.18초). 소량 벤치마크를 전체에 외삽하면 안 된다.
`daily-us.yml` 의 `timeout-minutes: 330` 은 이 실측에 맞춘 값이다(Actions 상한 6시간).

### 증분 수집

위 4시간은 매번 `period="max"`(1962년~)를 다시 받던 구조의 값이다. 지금은 **parquet 이 있는
종목은 최근 `--window`(기본 `3mo`)만 받아 뒤에 붙인다**. 전량 재수집은 `--full` 로 강제한다.

**액면분할 처리** — `auto_adjust=True` 라 분할이 나면 야후가 과거 가격을 전부 재계산한다.
그걸 모르고 뒤에만 붙이면 분할 이전 구간이 옛 가격으로 남아 계절성·백테스트가 오염된다.
그래서 **겹치는 날짜의 종가를 비교(`ADJUST_RTOL`)해 어긋나면 그 종목만 전량 재수집**한다.
`save()` 도 날짜뿐 아니라 종가까지 비교한다 — 분할은 날짜가 그대로고 가격만 바뀌기 때문이다.

> **증분 효과는 아직 전종목으로 측정되지 않았다.** 120종목 표본에서 1.6배였는데 그 규모는
> throttle 이 안 걸려 전체 예측에 쓸 수 없다(같은 표본으로 "전량 0.3시간"이 나왔지만 실측은 4시간).
> 전송량이 주는 건 확실하나 야후가 **요청 수** 기준으로 throttle 한다면 벽시계 개선은 작을 수 있다.
> 첫 증분 전종목 실행 후 이 표를 갱신할 것.

## 시총·섹터를 전종목에 채우지 않는 이유

`enrich_meta` 는 기본이 **거래대금 상위 2000종목**(`--top`)이다. 전종목(11.5k)을 채워도 화면 결과가
거의 같은데 비용만 크기 때문이다.

**소비처가 둘뿐이다.**
- **히트맵** — `build_sectors` 가 섹터당 상위 50개만 담고(`consts[:50]`), 섹터 색은
  시총가중 평균이라 대형주가 사실상 결정한다. 게다가 US 히트맵은 **TradingView 임베드가 기본 모드**
  (`app/heatmap/page.tsx` 의 `useState<Mode>("tv")`, TV 소스는 S&P500·나스닥100·전체미국)라
  우리 트리맵을 볼 일 자체가 적다.
- **검색 정렬** — `lib/universe.ts` 가 시총 내림차순으로 정렬한다. 시총이 없어도 검색은 되고
  순서만 뒤로 밀린다.

**비용은 크다.** `Ticker.info` 는 종목당 1요청이라 `yf.download` 같은 청크가 불가능하고,
연속 요청이 쌓이면 야후가 응답을 지연시킨다 — 실측으로 소량 구간 0.35초/종목이 1만 건 구간에서
**7초/종목**까지 떨어져 전종목이면 20시간을 넘겼다. 동시 요청을 늘리는 병렬화는 throttle 을
키우므로 쓰지 않는다.

우선순위는 이미 받아둔 OHLCV 로 **최근 20거래일 평균 거래대금**(`close × volume`)을 계산해 매긴다.
정렬 기준이 없으면 처리 순서가 임의가 되어, 중간에 멈췄을 때 아무도 안 찾는 종목만 채워질 수 있다.

**KR 도 동일하게 적용된다.** 다만 KRX 는 TradingView 무료 임베드가 불가해 우리 트리맵이 유일한
수단이라 시총·섹터 비중이 더 크다. yfinance 가 KR 도 GICS 섹터를 주므로 US 와 같은 11개 축을
공유한다. KIND 표준산업분류(159개 세분류)를 섹터로 쓰면 히트맵이 잘게 쪼개지므로 아예 넣지 않는다 —
yfinance 가 섹터를 못 주는 종목은 `기타` 한 덩어리로 남는다(실측 589종목, 시총 비중 2.4%).

## 배치(cron)

`.github/workflows/daily-kr.yml`(07:30 UTC) · `daily-us.yml`(22:00 UTC) · `quarterly-13f.yml`.
휴장일이면(최신 봉이 직전과 동일) 업로드 스킵. 프로덕션은 R2 + secrets 필요.
**현 로컬 데이터는 자동 갱신 아님(수동 스냅샷).** 매일 갱신하려면 launchd/cron 또는 Actions 필요.

스키마: [data-schema.md](data-schema.md)
