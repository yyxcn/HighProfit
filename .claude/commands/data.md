---
description: 로컬 시세 데이터 갱신 (apps/web/public/data 에 증분 수집, R2 업로드 없음)
argument-hint: "[kr|us|all] (기본 all) · --full 전량재수집 · --refresh-meta 시총 재계산"
allowed-tools: Bash, Read
---

`apps/web/public/data` 에 시세를 수집한다. R2·GitHub Actions 없이 `npm run dev` 로 확인하는 용도이므로 **`upload_r2` 는 절대 실행하지 않는다.**

대상: `$ARGUMENTS` (비어 있으면 `all`)

## 전제

**백필은 2026-08-09 에 끝났다. 지금부터는 증분이 기본이다.**
기존 parquet 이 있으면 최근 3개월만 받아 뒤에 붙이므로 매일 돌려도 부담이 적다.

- 시세: KR·US **전종목**, 전부 yfinance(`.KS`/`.KQ`). 계정·API 키 불필요
- 시총·섹터: 시장별 **거래대금 상위 2000**만 (아래 근거)
- KR·US 모두 같은 소스·코드 경로. **다른 데이터 소스를 섞어 넣지 말 것**

### 실측 소요 (2026-08-09, 전량 기준)

| | 종목 | 전량 | 증분 |
|---|---|---|---|
| `fetch_kr` | 2,703 | **5분** | 더 짧음 |
| `fetch_us` | 11,534 | **4시간** | 미측정 |

US 전량이 4시간인 건 야후가 대량 구간에서 throttle 하기 때문이다(1.26초/종목, 소량 샘플은 0.18초).
**소량 표본 속도를 전체에 외삽하지 말 것** — 실제로 두 번 틀렸다.

### 왜 시총·섹터는 상위 2000인가

소비처가 두 곳뿐이다:
- **히트맵** — `build_sectors` 가 섹터당 상위 50개만 쓰고, 섹터 색은 시총가중이라 대형주가 결정한다.
- **검색 정렬** — 시총 내림차순(`universe.ts`). 없어도 검색은 되고 순서만 뒤로 밀린다.

반면 `Ticker.info` 는 종목당 1요청이라 청크가 불가능해 전종목이면 **20시간+** 다.
**요청이 없으면 `--top` 을 키우지 말 것.** 병렬화는 throttle 을 키우므로 금지.

## 0. 사전 확인

```bash
ls pipeline/.venv/bin/python
```

없으면 여기서 멈추고 알린다:
`python3.13 -m venv pipeline/.venv && pipeline/.venv/bin/pip install -r pipeline/requirements.txt`

## 1. 실행

모든 Bash 호출 앞에 붙인다 (셸 상태는 호출 간 유지되지 않는다):
```
HP_DATA_DIR=/Users/charles/HighProfit/apps/web/public/data
```

오래 걸리므로 **`nohup` 으로 분리해 띄우고** 단계별 성공/실패를 파일에 남긴다.
한 단계가 실패해도 다음은 진행하되 실패 목록을 모아 마지막에 보고한다.

**① 종목 인덱스** (약 5초, 대상 무관하게 항상)
신규상장·상장폐지 반영, 워런트·권리증서·SPAC유닛·우선주·채권 제외.
MLP(`Common Units`)는 정상 지분이라 유지한다. KR 섹터는 여기서 채우지 않고 `기타`로 둔다(④가 GICS 로 채움).
```bash
pipeline/.venv/bin/python -m pipeline.dev.build_full_universe
```

**② KR 시세** (`all`/`kr`)
```bash
pipeline/.venv/bin/python -m pipeline.daily.fetch_kr
```

**③ US 시세** (`all`/`us`)
```bash
pipeline/.venv/bin/python -m pipeline.daily.fetch_us
```

> `$ARGUMENTS` 에 `--full` 이 있으면 ②③에 붙여 전량 재수집한다(월 1회 정합성 점검, 또는 소스 교체 시).
> 전량은 US 4시간이므로 **시작 전에 사용자에게 소요를 알린다.**

**④ 시총·섹터** — 시총이 빈 종목만 조회하므로 평소엔 신규상장분 수십 건이라 몇 초에 끝난다.
```bash
pipeline/.venv/bin/python -m pipeline.dev.enrich_meta --market all
```
`--refresh-meta` 가 있으면 상위 2000의 시총·섹터를 전부 재계산(월 1회면 충분):
```bash
pipeline/.venv/bin/python -m pipeline.dev.enrich_meta --market all --all
```

**⑤ 집계** — **순서 엄수.** `build_sectors` 가 `universe.json` 을 읽고 `build_universe` 가 그 파일을 쓴다.
뒤집으면 낡은 유니버스로 집계돼 방금 채운 값이 반영되지 않는다.
```bash
pipeline/.venv/bin/python -m pipeline.daily.build_universe
pipeline/.venv/bin/python -m pipeline.daily.build_sectors
```

**⑥ 고아 parquet 정리** — 유니버스에서 빠졌는데 파일만 남은 것(상장폐지·필터 변경분).
**유니버스가 확정된 뒤에만** 계산한다.
```bash
pipeline/.venv/bin/python -c "
import json, pathlib
d = pathlib.Path('apps/web/public/data')
for m in ('KR','US'):
    uni = {x['t'] for x in json.load(open(d/f'universe_{m.lower()}.json'))}
    ps = {p.stem: p for p in (d/'ohlcv'/m).glob('*.parquet')}
    orph = sorted(set(ps) - uni)
    sz = sum(ps[t].stat().st_size for t in orph)/1e6
    for t in orph: ps[t].unlink()
    print(f'{m}: 고아 {len(orph)}개 삭제 ({sz:.0f}MB)')
"
```

## 2. 보고

**실패한 단계가 있으면 성공으로 보고하지 말고 무엇이 갱신되지 않았는지 명시한다.**
`시총 0` 이 직전보다 크게 늘었으면 ④가 제대로 안 돈 것이므로 함께 알린다.

```bash
pipeline/.venv/bin/python -c "
import json, pathlib
d = pathlib.Path('apps/web/public/data')
print(json.loads((d/'meta.json').read_text()))
u = json.loads((d/'universe.json').read_text())
print('universe:', len(u), '| 시총 0:', sum(1 for x in u if not x.get('c')))
for m in ('KR','US'):
    uni = json.load(open(d/f'universe_{m.lower()}.json'))
    print(f'{m}: universe {len(uni)} | parquet {len(list((d/\"ohlcv\"/m).glob(\"*.parquet\")))}')
for s in ('KR','US','ETF'):
    f = json.load(open(d/f'sectors/{s}.json'))
    print(f'sectors/{s}: {len(f[\"sectors\"])}섹터')
"
```

KR·US 섹터가 GICS 11개(+`기타`) 축을 공유하는지 확인한다 — 한쪽만 수십 개면 ④가 덜 돈 것이다.
마지막에 `npm run dev` 로 확인하라고 안내한다.
