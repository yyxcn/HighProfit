"""
CUSIP → 티커 매핑 (OpenFIGI). 13F 수집 뒤 1회.

13F INFORMATION TABLE 은 CUSIP 만 준다. 손으로 관리하던 config/cusip_map.csv 로는
포지션의 1% 남짓만 티커가 붙어 인기 주식 탭·차트 링크·성과 계산이 전부 막힌다.
OpenFIGI(무료, 무인증 가능) 배치 매핑으로 캐시된 전 분기 CUSIP 을 한 번에 변환한다.

- 입력: .cache/13f/*.json 의 모든 CUSIP (+ DATA_DIR/funds/*.json 보조)
- 출력: config/cusip_map.csv (cusip,ticker) — 기존 수기 항목은 보존·우선
- 실패분은 config/cusip_unmapped.txt 에 적어 재실행 시 건너뛴다(--retry-missed 로 무시).
  **저장소에 커밋한다** — 안 그러면 CI 가 매 분기 매핑 불가능한 1만여 건을 다시 조회한다.

레이트리밋: 키 없으면 25요청/분 × 10건, 키 있으면 25요청/6초 × 100건.
  OPENFIGI_API_KEY=... python -m pipeline.quarterly.map_cusips
  ... --dry-run    # 매핑 대상 개수만 출력
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
from pathlib import Path

import requests

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
CONFIG = PIPELINE_ROOT / "config"
CACHE = PIPELINE_ROOT / ".cache"
MAP_CSV = CONFIG / "cusip_map.csv"
MISSED = CONFIG / "cusip_unmapped.txt"

URL = "https://api.openfigi.com/v3/mapping"
API_KEY = os.environ.get("OPENFIGI_API_KEY", "")
# 무인증 25요청/분·10건, 인증 25요청/6초·100건 (공식 한도). 여유를 두고 잡는다.
BATCH = 100 if API_KEY else 10
PAUSE = 0.30 if API_KEY else 2.6

# 롱온리 주식 성과가 목적 — 채권/선물/워런트는 티커를 붙이지 않는다.
GOOD_TYPES = {
    "Common Stock", "Depositary Receipt", "REIT", "Preference", "Preferred Stock",
    "Closed-End Fund", "ETP", "Mutual Fund", "Unit", "Royalty Trust", "Ltd Part",
    "MLP", "Tracking Stk", "NY Reg Shrs", "Open-End Fund",
}


def load_map() -> dict[str, str]:
    if not MAP_CSV.exists():
        return {}
    with MAP_CSV.open(encoding="utf-8") as f:
        return {r["cusip"].strip(): r["ticker"].strip() for r in csv.DictReader(f) if r.get("ticker")}


def save_map(m: dict[str, str]) -> None:
    MAP_CSV.parent.mkdir(parents=True, exist_ok=True)
    with MAP_CSV.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["cusip", "ticker"])
        for cusip in sorted(m):
            w.writerow([cusip, m[cusip]])


def load_missed() -> set[str]:
    if not MISSED.exists():
        return set()
    return {ln.strip() for ln in MISSED.read_text(encoding="utf-8").splitlines() if ln.strip()}


def save_missed(s: set[str]) -> None:
    MISSED.parent.mkdir(parents=True, exist_ok=True)
    MISSED.write_text("\n".join(sorted(s)), encoding="utf-8")


def collect_cusips() -> dict[str, float]:
    """
    13F 캐시 + 배포된 펀드 파일의 모든 CUSIP → 등장 평가액 합계.
    무인증 한도로는 전체 매핑에 시간이 걸리므로 **금액이 큰 것부터** 처리한다
    (중간에 끊겨도 커버리지가 먼저 오른다 — 진행분은 주기적으로 저장된다).
    """
    out: dict[str, float] = {}
    for p in (CACHE / "13f").glob("*.json"):
        try:
            for h in json.loads(p.read_text(encoding="utf-8")).get("holdings", []):
                out[h["cusip"]] = out.get(h["cusip"], 0.0) + float(h.get("value") or 0)
        except (json.JSONDecodeError, KeyError, TypeError):
            continue
    from pipeline.lib import io

    for p in (io.DATA_DIR / "funds").glob("*_*.json"):
        try:
            for h in json.loads(p.read_text(encoding="utf-8")).get("positions", []):
                out.setdefault(h["cusip"], float(h.get("value") or 0))
        except (json.JSONDecodeError, KeyError, TypeError):
            continue
    return out


def normalize(ticker: str) -> str:
    """OpenFIGI 표기 → 우리 OHLCV 파일명(yfinance 규칙). 클래스 `BRK/B`→`BRK-B`, 상폐 표시 `EA*`→`EA`."""
    return ticker.strip().upper().rstrip("*").replace("/", "-").replace(".", "-")


def available_tickers() -> set[str]:
    """보유 중인 US OHLCV 티커 — 폴백 매핑의 검증 수단."""
    from pipeline.lib import io

    return {p.stem.upper() for p in (io.DATA_DIR / "ohlcv" / "US").glob("*.parquet")}


def pick(data: list[dict], us_scoped: bool, have: set[str]) -> str | None:
    """
    OpenFIGI 후보 중 미국 상장 보통주 티커 하나.
    us_scoped=False (거래소 미지정 폴백)면 **`exchCode == "US"` 인 컴포지트만** 받는다 —
    우리 OHLCV 는 미국 상장분뿐이라 런던·토론토 티커를 집어오면 가격을 못 찾는다.
    """
    candidates = data if us_scoped else [d for d in data if d.get("exchCode") == "US"]
    for d in candidates:
        if d.get("marketSector") != "Equity":
            continue
        st2 = d.get("securityType2") or d.get("securityType") or ""
        if GOOD_TYPES and st2 not in GOOD_TYPES:
            continue
        t = d.get("ticker")
        if t:
            return normalize(t)
    # 타입 필터로 다 걸러졌으면 첫 티커라도
    for d in candidates:
        if d.get("ticker"):
            return normalize(d["ticker"])
    # 상장폐지·피인수(EA 처럼 `EA*`)는 US 컴포지트가 사라져 위에서 다 걸린다.
    # 이력 성과에는 여전히 필요하므로, 우리가 실제로 가진 티커일 때만 받아들인다.
    if not us_scoped:
        for d in data:
            t = d.get("ticker")
            if t and d.get("marketSector") == "Equity" and normalize(t) in have:
                return normalize(t)
    return None


def request_batch(
    cusips: list[str], session: requests.Session, us_only: bool = True, id_type: str = "ID_CUSIP"
) -> list[dict]:
    """OpenFIGI 매핑 1배치. 429 는 백오프 후 재시도."""
    body: list[dict] = [
        {"idType": id_type, "idValue": c, **({"exchCode": "US"} if us_only else {})}
        for c in cusips
    ]
    headers = {"Content-Type": "application/json"}
    if API_KEY:
        headers["X-OPENFIGI-APIKEY"] = API_KEY

    delay = PAUSE
    for attempt in range(6):
        r = session.post(URL, json=body, headers=headers, timeout=30)
        if r.status_code == 429:
            delay = min(delay * 2, 90)
            print(f"    ~ 429, {delay:.0f}s 대기", file=sys.stderr)
            time.sleep(delay)
            continue
        r.raise_for_status()
        return r.json()
    raise RuntimeError("OpenFIGI 429 반복 — 중단")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--retry-missed", action="store_true", help="이전 실패분도 다시 조회")
    ap.add_argument("--limit", type=int, default=0, help="이번 실행에서 조회할 CUSIP 상한")
    args = ap.parse_args()

    known = load_map()
    prior_missed = load_missed()
    # --retry-missed 는 '건너뛰지 않는다'는 뜻이지 실패 기록을 버린다는 뜻이 아니다.
    missed = set() if args.retry_missed else prior_missed
    allc = collect_cusips()
    todo = sorted(
        (c for c in allc if c not in known and c not in missed),
        key=lambda c: -allc[c],  # 금액 큰 순
    )
    if args.limit:
        todo = todo[: args.limit]

    print(f"CUSIP 총 {len(allc)} · 기매핑 {len(known)} · 실패이력 {len(missed)} · 이번 조회 {len(todo)}")
    if args.dry_run or not todo:
        return
    if not API_KEY:
        eta = len(todo) / BATCH * PAUSE / 60
        print(f"  (OPENFIGI_API_KEY 없음 — 무인증 한도로 약 {eta:.0f}분 예상)")

    session = requests.Session()
    have = available_tickers()
    new_missed = set()
    added = 0

    def resolve(chunk: list[str], us_only: bool, id_type: str = "ID_CUSIP") -> list[str]:
        """배치 조회 후 매핑된 것은 known 에 넣고, 못 찾은 CUSIP 목록을 돌려준다."""
        nonlocal added
        try:
            res = request_batch(chunk, session, us_only=us_only, id_type=id_type)
        except Exception as e:  # noqa: BLE001
            print(f"  ! 배치 실패: {e}", file=sys.stderr)
            return chunk
        left = []
        for cusip, item in zip(chunk, res):
            t = pick(item.get("data") or [], us_only, have) if isinstance(item, dict) else None
            if t:
                known[cusip] = t
                added += 1
            else:
                left.append(cusip)
        time.sleep(PAUSE)
        return left

    for i in range(0, len(todo), BATCH):
        left = resolve(todo[i : i + BATCH], us_only=True)
        # 1차(exchCode=US)에서 빠진 것만 좁혀가며 재조회한다.
        if left:
            # 거래소 미지정 — 상폐·피인수 종목은 US 컴포지트가 없어 여기서 걸린다.
            left = resolve(left, us_only=False)
        cins = [c for c in left if c[:1].isalpha()]
        if cins:
            # G/H 로 시작하면 CUSIP 이 아니라 CINS(외국 발행사 — Linde·Ferguson 등).
            # ID_CUSIP 로는 아예 안 잡히고 ID_CINS 로 조회해야 한다.
            cins_set = set(cins)
            still = set(resolve(cins, us_only=False, id_type="ID_CINS"))
            left = [c for c in left if c not in cins_set or c in still]
        new_missed.update(left)
        if (i // BATCH) % 20 == 0:
            save_map(known)
            save_missed((prior_missed | new_missed) - set(known))
            print(f"  … {i + BATCH}/{len(todo)} 처리, 매핑 {added}")

    save_map(known)
    save_missed((prior_missed | new_missed) - set(known))
    print(f"완료: 신규 매핑 {added}, 미매핑 {len(new_missed)} (총 {len(known)})")


if __name__ == "__main__":
    main()
