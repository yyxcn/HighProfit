"""
펀드 이름 → CIK 해석 (EDGAR). funds.csv 를 손으로 채우지 않기 위한 도구.

CIK 는 절대 추측하면 안 된다(틀리면 남의 포트폴리오를 그 펀드 성과로 보여준다).
EDGAR 회사검색으로 후보를 받고, submissions API 로 **실제 13F-HR 이력**을 확인해 고른다.
공시가 끊긴 매니저는 아예 떨어뜨린다(--max-age 로 조절).

입력  config/fund_candidates.csv  (search,manager,category)
출력  config/funds.csv            (name,cik,manager,category) — 기본은 미리보기, --write 로 저장

  SEC_USER_AGENT="HighProfit you@example.com" python -m pipeline.dev.find_13f_ciks --write
"""
from __future__ import annotations

import argparse
import csv
import os
import sys
import time
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import quote_plus
from xml.etree import ElementTree as ET

import requests

CONFIG = Path(__file__).resolve().parents[1] / "config"
UA = os.environ.get("SEC_USER_AGENT", "HighProfit contact@example.com")
SLEEP = 0.15
MAX_AGE_DAYS = 400  # 이보다 오래 공시가 없으면 '운용 중'으로 보지 않는다


def _get(url: str, as_json: bool = False):
    r = requests.get(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip"}, timeout=30)
    r.raise_for_status()
    time.sleep(SLEEP)
    return r.json() if as_json else r.text


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def search_companies(name: str) -> list[tuple[str, str]]:
    """EDGAR 회사검색(13F-HR 제출자만) → [(cik10, conformed_name)]."""
    url = (
        "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany"
        f"&company={quote_plus(name)}&type=13F-HR&dateb=&owner=include&count=40&output=atom"
    )
    try:
        xml = _get(url)
        root = ET.fromstring(xml)
    except (requests.HTTPError, ET.ParseError):
        return []

    out: list[tuple[str, str]] = []
    for el in root.iter():
        if _local(el.tag) != "company-info":
            continue
        cik = conformed = ""
        for c in el:
            if _local(c.tag) == "cik":
                cik = (c.text or "").strip()
            elif _local(c.tag) == "conformed-name":
                conformed = (c.text or "").strip()
        if cik:
            out.append((cik.zfill(10), conformed))
    # 중복 제거(순서 유지)
    seen: set[str] = set()
    return [(c, n) for c, n in out if not (c in seen or seen.add(c))]


def latest_13f(cik10: str) -> tuple[str, int] | None:
    """(마지막 13F-HR reportDate, 총 13F-HR 건수). 없으면 None."""
    try:
        data = _get(f"https://data.sec.gov/submissions/CIK{cik10}.json", as_json=True)
    except requests.HTTPError:
        return None
    recent = data.get("filings", {}).get("recent", {})
    dates = [
        rep
        for form, rep in zip(recent.get("form", []), recent.get("reportDate", []))
        if form == "13F-HR" and rep
    ]
    if not dates:
        return None
    return max(dates), len(dates)


def resolve(row: dict, cutoff: str) -> dict | None:
    """후보 중 13F 이력이 가장 최근·풍부한 것을 고른다."""
    best = None
    for cik, conformed in search_companies(row["search"])[:6]:
        info = latest_13f(cik)
        if not info:
            continue
        last, count = info
        if last < cutoff:
            continue
        key = (last, count)
        if best is None or key > best[0]:
            best = (key, {"name": conformed, "cik": cik, "last": last, "count": count})
    if best is None:
        return None
    out = best[1]
    if not out["name"]:  # 단일 매치일 때 conformed-name 이 비어 오는 경우가 있다
        out["name"] = row["search"]
    out["manager"] = row.get("manager", "")
    out["category"] = row.get("category", "")
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="config/funds.csv 에 저장")
    ap.add_argument("--max-age", type=int, default=MAX_AGE_DAYS)
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    src = CONFIG / "fund_candidates.csv"
    with src.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if args.limit:
        rows = rows[: args.limit]

    cutoff = (date.today() - timedelta(days=args.max_age)).isoformat()
    found: dict[str, dict] = {}
    missing: list[str] = []

    for row in rows:
        try:
            hit = resolve(row, cutoff)
        except Exception as e:  # noqa: BLE001
            print(f"  ! {row['search']}: {e}", file=sys.stderr)
            hit = None
        if not hit:
            missing.append(row["search"])
            print(f"  ✗ {row['search']}", file=sys.stderr)
            continue
        if hit["cik"] in found:  # 같은 운용사를 두 이름으로 적은 경우
            continue
        found[hit["cik"]] = hit
        print(f"  ✓ {row['search']:34s} → {hit['cik']} {hit['name'][:38]:40s} {hit['last']} ({hit['count']}건)")

    print(f"\n해석 {len(found)} / 후보 {len(rows)} · 실패 {len(missing)}")
    if missing:
        print("실패: " + ", ".join(missing))

    if not args.write:
        print("(--write 를 주면 config/funds.csv 에 저장)")
        return

    ordered = sorted(found.values(), key=lambda h: (h["category"], h["name"]))
    with (CONFIG / "funds.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["name", "cik", "manager", "category"])
        for h in ordered:
            w.writerow([h["name"], h["cik"], h["manager"], h["category"]])
    print(f"저장: config/funds.csv ({len(ordered)} 펀드)")


if __name__ == "__main__":
    main()
