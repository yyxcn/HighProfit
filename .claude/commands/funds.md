---
description: 13F 펀드 데이터 분기 갱신 (수집 → CUSIP 매핑 → 성과·인기주식 집계)
argument-hint: "없음 (기본) · --quarters N 수집 분기 수 · --retry-missed 미매핑 재조회"
allowed-tools: Bash, Read, Edit
---

`apps/web/public/data/funds` 를 갱신한다. 13F 마감(2/14·5/15·8/14·11/14) 며칠 뒤에 돌린다.
로컬 확인용이므로 **`upload_r2` 는 실행하지 않는다.**

추가 인자: `$ARGUMENTS`

## 전제

**최초 적재는 2026-08-10 에 끝났다(100펀드 × 40분기). 지금부터는 증분이다.**

- **순서 엄수: `fetch_13f` → `map_cusips` → `build_fund_stats`.**
  매핑이 안 된 상태로 집계하면 커버리지가 낮다고 판단해 펀드가 랭킹에서 통째로 빠진다.
- `pipeline/.cache/13f/` (약 150MB, gitignore) 는 **절대 지우지 않는다.** 있으면 새 분기만 받아 2분,
  없으면 SEC 요청 8,000건이라 40분~1시간이다. OpenFIGI 키는 SEC 속도와 **무관하다**(SEC 는 키가 없고
  초당 10요청 미만 준수가 조건이라 코드가 0.15초씩 쉰다).
- 두 자격 정보는 성격이 다르다:
  | | 어디에 | 없으면 |
  |---|---|---|
  | `SEC_USER_AGENT` | 연락처 문자열(비밀 아님) | EDGAR 가 403 |
  | `OPENFIGI_API_KEY` | `.env` (gitignore) | 동작은 하나 매핑이 25배 느려짐 |

### 실측 소요 (2026-08-10)

| 단계 | 최초 | 분기 갱신 |
|---|---|---|
| `fetch_13f` | 40분~1시간 (신고 4,000건) | **~2분** (펀드당 1분기) |
| `map_cusips` | 3시간(무인증) / 5분(키) | **~1분** |
| `build_fund_stats` | 2분 | 2분 |

## 0. 사전 확인

```bash
ls pipeline/.venv/bin/python && ls pipeline/.cache/13f | wc -l && grep -c OPENFIGI .env
```

- venv 없으면 멈추고 알린다: `python3.13 -m venv pipeline/.venv && pipeline/.venv/bin/pip install -r pipeline/requirements.txt`
- 캐시 파일 수가 **0 이면 최초 적재 상황**이다. 1시간 이상 걸린다는 걸 먼저 알리고 진행 여부를 확인받는다.
- `.env` 에 키가 없으면 진행은 하되 매핑이 오래 걸린다고 알린다.

## 1. 실행

셸 상태는 호출 간 유지되지 않으므로 매 Bash 호출에 환경을 다시 넣는다:
```
cd /Users/charles/HighProfit && export HP_DATA_DIR=$PWD/apps/web/public/data && export $(grep OPENFIGI .env | xargs)
```

**① 13F 수집** — 펀드당 최신 40분기. 캐시에 있는 분기는 SEC 를 다시 부르지 않는다.
정정신고(13F-HR/A)도 후보로 보고 내용이 빈 신고는 건너뛴다(Norges Bank 대응).
```bash
SEC_USER_AGENT="HighProfit yueon0727@gmail.com" pipeline/.venv/bin/python -m pipeline.quarterly.fetch_13f
```

**② CUSIP → 티커 매핑** — 새로 등장한 CUSIP 만 조회한다.
`config/cusip_map.csv`(성공)·`config/cusip_unmapped.txt`(실패)가 저장소에 있어서 재조회하지 않는다.
```bash
pipeline/.venv/bin/python -m pipeline.quarterly.map_cusips
```

**③ 집계** — `performance.json`(성과 랭킹) + `popular.json`(분기별 인기 주식).
US 수정주가(`ohlcv/US/*.parquet`)를 읽으므로 **`/data` 를 먼저 돌려 시세가 최신인 편이 좋다.**
```bash
pipeline/.venv/bin/python -m pipeline.quarterly.build_fund_stats
```

## 2. 보고

**stderr 의 `~ … 제외` 줄을 반드시 읽고 보고한다.** 조용히 빠진 펀드가 있으면 "100개"라고 말하면 안 된다.

제외 사유는 둘뿐이다:
- `커버리지 N% < 50%` — 티커 매핑이 절반도 안 됨. 상장폐지·피인수 종목이 많은 전략(합병차익 등)은 구조적으로 이렇다.
- `… 이후 공시 없음` — 공시가 끊긴 펀드. 랭킹에서 뺀다.

```bash
cd /Users/charles/HighProfit && pipeline/.venv/bin/python -c "
import json, csv, pathlib
d = pathlib.Path('apps/web/public/data/funds')
reg = sum(1 for _ in csv.DictReader(open('pipeline/config/funds.csv')))
p = json.loads((d/'performance.json').read_text())
c = sorted(x['coverage'] for x in p['funds'])
from collections import Counter
print(f\"등록 {reg} · 랭킹 {len(p['funds'])} · asOf {p['asOf']}\")
print('커버리지 최저 %.0f%% / 중앙 %.0f%% / 최고 %.0f%%' % (c[0]*100, c[len(c)//2]*100, c[-1]*100))
print('신뢰도', dict(Counter(x['reliability'] for x in p['funds'])))
q = json.loads((d/'popular.json').read_text())['quarters'][-1]
print(f\"최신 분기 {q['quarter']} · 신고 {q['filed']}/{q['total']}\")
print('매핑', sum(1 for _ in csv.DictReader(open('pipeline/config/cusip_map.csv'))))
"
```

**최신 분기의 `신고 N/M` 이 낮은 건 정상이다** — 마감 직후엔 아직 대부분 신고 전이다.
인기 주식 탭은 신고가 가장 많은 분기로 열리게 되어 있다.

`git status` 로 `pipeline/config/cusip_map.csv`·`cusip_unmapped.txt` 변경을 확인하고,
**커밋은 사용자가 요청할 때만** 한다.

## 펀드 목록 변경

`pipeline/config/funds.csv` 를 직접 편집한 뒤 ①②③ 을 다시 돌린다.

CIK 는 **추측 금지** — 틀리면 남의 포트폴리오를 그 펀드 성과로 보여준다.
모를 때만 조회한다(미리보기, `--write` 없이):
```bash
SEC_USER_AGENT="HighProfit yueon0727@gmail.com" pipeline/.venv/bin/python -m pipeline.dev.find_13f_ciks
```

> `--write` 는 `funds.csv` 를 **통째로 덮어쓴다.** 현재 100개는 후보 155개에서 손으로 추린 결과라
> 그대로 실행하면 그 작업이 날아간다. 몇 개만 손볼 때는 `funds.csv` 직접 편집이 맞다.
