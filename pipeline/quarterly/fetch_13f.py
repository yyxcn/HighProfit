"""
SEC EDGAR 13F-HR 수집 (명세 6-5, Phase 8). 분기 1회.
- config/funds.csv 의 CIK 순회 → 최신 13F-HR 부터 과거 --quarters 개 분기까지
- INFORMATION TABLE xml 파싱 → 분기별 홀딩을 **로컬 캐시**(.cache/13f/)에 적재
  (이력 원본은 수십 MB 라 배포하지 않는다. 성과·인기주식 집계의 입력으로만 쓴다 →
   pipeline.quarterly.build_fund_stats)
- 최신 분기만 DATA_DIR/funds/ 로 배포 (펀드 상세 탭이 읽는 파일)
- cusip→ticker 매핑(config/cusip_map.csv, 미매핑은 이름 노출 → pipeline.quarterly.map_cusips)
- 비중 = value/총합, 전분기 대비 신규/증가/감소/청산 산출
- User-Agent 필수, 요청 간 지연으로 rate limit 준수

  SEC_USER_AGENT="HighProfit you@example.com" python -m pipeline.quarterly.fetch_13f
  ... --limit 1        # 펀드 1개만 (테스트)
  ... --quarters 4     # 최근 4분기만
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import time
from pathlib import Path
from xml.etree import ElementTree as ET

import requests

from pipeline.lib import io

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
CONFIG = PIPELINE_ROOT / "config"
CACHE = PIPELINE_ROOT / ".cache" / "13f"
UA = os.environ.get("SEC_USER_AGENT", "HighProfit contact@example.com")
SLEEP = 0.15  # 초당 <10요청
DEFAULT_QUARTERS = 40  # 10년 — 5Y 연환산을 온전히 채우고 설정 연도가 갈리는 최소 길이


def _get(url: str, as_json: bool = False):
    r = requests.get(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip"}, timeout=30)
    r.raise_for_status()
    time.sleep(SLEEP)
    return r.json() if as_json else r.text


def load_cusip_map() -> dict[str, str]:
    p = CONFIG / "cusip_map.csv"
    if not p.exists():
        return {}
    with p.open(encoding="utf-8") as f:
        return {row["cusip"].strip(): row["ticker"].strip() for row in csv.DictReader(f)}


def load_funds() -> list[dict]:
    """funds.csv → [{name, cik, category}]. category 열은 없어도 동작."""
    with (CONFIG / "funds.csv").open(encoding="utf-8") as f:
        return [
            {
                "name": r["name"],
                "cik": r["cik"].strip(),
                "category": (r.get("category") or "").strip(),
                "manager": (r.get("manager") or "").strip(),
            }
            for r in csv.DictReader(f)
        ]


def quarter_of(report_date: str) -> str:
    y, m = report_date[:4], int(report_date[5:7])
    return f"{y}Q{(m - 1) // 3 + 1}"


FORMS_13F = ("13F-HR", "13F-HR/A")


def find_13f_accessions(cik10: str) -> list[dict]:
    """
    최신 분기순 [{quarter, reportDate, candidates:[{accession, filingDate}]}].

    정정신고(13F-HR/A)도 후보에 넣는다 — Norges Bank 처럼 **원본은 더미 한 줄(CUSIP 000000000)로
    내고 실제 보유는 정정으로 내는** 제출자가 있어서, 13F-HR 만 보면 그 분기가 통째로 빈다.
    후보는 공시일 내림차순(최신 우선)이고, 실제로 쓸 것은 ensure_quarter 가 고른다.
    """
    data = _get(f"https://data.sec.gov/submissions/CIK{cik10}.json", as_json=True)
    recent = data["filings"]["recent"]
    by_q: dict[str, dict] = {}
    for form, acc, rep, fil in zip(
        recent["form"], recent["accessionNumber"], recent["reportDate"], recent["filingDate"]
    ):
        if form not in FORMS_13F or not rep:
            continue
        q = quarter_of(rep)
        entry = by_q.setdefault(q, {"quarter": q, "reportDate": rep, "candidates": []})
        entry["candidates"].append({"accession": acc, "filingDate": fil})
    for entry in by_q.values():
        entry["candidates"].sort(key=lambda c: c["filingDate"], reverse=True)
    return sorted(by_q.values(), key=lambda e: e["quarter"], reverse=True)


def fetch_info_table(cik_int: int, accession: str) -> list[dict]:
    """accession 의 INFORMATION TABLE xml 파싱 → [{cusip,name,value,shares}]."""
    nodash = accession.replace("-", "")
    base = f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{nodash}"
    index = _get(f"{base}/index.json", as_json=True)
    names = [it["name"] for it in index["directory"]["item"] if it["name"].lower().endswith(".xml")]
    # info table 후보: primary_doc 제외, 이름에 table/info 우선
    names.sort(key=lambda n: (0 if re.search(r"info|table", n, re.I) else 1, n))
    for name in names:
        if name.lower() == "primary_doc.xml":
            continue
        xml = _get(f"{base}/{name}")
        if "informationTable" not in xml and "infoTable" not in xml:
            continue
        return parse_info_table(xml)
    return []


def _local(tag: str) -> str:
    """'{ns}infoTable' 또는 'ns:infoTable' → 'infoTable'."""
    return tag.rsplit("}", 1)[-1].rsplit(":", 1)[-1]


def _text(el, name: str) -> str:
    """el 의 하위(자기 포함)에서 로컬명이 name 인 첫 요소 텍스트."""
    for c in el.iter():
        if _local(c.tag) == name:
            return (c.text or "").strip()
    return ""


def parse_info_table(xml: str) -> list[dict]:
    # 정규식으로 XML을 훼손하지 않는다. 그대로 파싱 후 로컬명으로 매칭(네임스페이스 무관).
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        # 프리픽스는 있으나 선언이 깨진 경우: 프리픽스/xmlns 를 태그·속성 모두에서 제거 후 재시도
        cleaned = re.sub(r'xmlns(:[\w.]+)?="[^"]*"', "", xml)
        cleaned = re.sub(r"(</?)[\w.]+:", r"\1", cleaned)          # 태그 프리픽스
        cleaned = re.sub(r"\s[\w.]+:([\w.]+\s*=)", r" \1", cleaned)  # 속성 프리픽스
        root = ET.fromstring(cleaned)

    rows = []
    for it in root.iter():
        if _local(it.tag) != "infoTable":
            continue
        cusip = _text(it, "cusip")
        if not cusip:
            continue
        rows.append(
            {
                "cusip": cusip.upper(),
                "name": _text(it, "nameOfIssuer"),
                "value": float(_text(it, "value") or 0),
                "shares": float(_text(it, "sshPrnamt") or 0),
                # PRN(채권 액면) 은 주식이 아니다 — 성과 계산에서 제외해야 한다
                "unit": (_text(it, "sshPrnamtType") or "SH").upper(),
                "cls": (_text(it, "putCall") or "").upper(),  # 옵션은 롱온리 성과에서 제외
            }
        )
    return rows


PLACEHOLDER_CUSIP = "000000000"  # '보유 없음' 더미 행


def aggregate(rows: list[dict]) -> dict[str, dict]:
    """cusip 별 합산 (여러 클래스 합침). 옵션(PUT/CALL)·채권(PRN)·더미 행은 버린다."""
    agg: dict[str, dict] = {}
    for r in rows:
        if r.get("cls") or r.get("unit", "SH") != "SH":
            continue
        if r["cusip"] == PLACEHOLDER_CUSIP or (r["value"] <= 0 and r["shares"] <= 0):
            continue
        a = agg.setdefault(r["cusip"], {"name": r["name"], "value": 0.0, "shares": 0.0})
        a["value"] += r["value"]
        a["shares"] += r["shares"]
    return agg


# ---- 캐시 (분기별 원본 홀딩) ----

def cache_path(cik10: str, quarter: str) -> Path:
    return CACHE / f"{cik10}_{quarter}.json"


def load_cached(cik10: str, quarter: str) -> dict | None:
    p = cache_path(cik10, quarter)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def save_cached(obj: dict) -> None:
    p = cache_path(obj["cik"], obj["quarter"])
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


MAX_CANDIDATES = 3  # 한 분기에 원본+정정 몇 건까지 시도할지


def ensure_quarter(cik10: str, entry: dict) -> dict | None:
    """
    분기 홀딩을 캐시에서 읽거나 SEC 에서 받아 캐시에 적재.
    최신 신고부터 시도하고 **내용이 빈 신고는 건너뛴다**(더미 원본 → 정정본으로 넘어감).
    """
    cached = load_cached(cik10, entry["quarter"])
    if cached:
        return cached

    for cand in entry["candidates"][:MAX_CANDIDATES]:
        rows = aggregate(fetch_info_table(int(cik10), cand["accession"]))
        if not rows:
            continue
        obj = {
            "cik": cik10,
            "quarter": entry["quarter"],
            "reportDate": entry["reportDate"],
            "filedAt": cand["filingDate"],
            "holdings": [
                {"cusip": c, "name": v["name"], "value": round(v["value"]), "shares": round(v["shares"])}
                for c, v in sorted(rows.items(), key=lambda kv: -kv[1]["value"])
            ],
        }
        save_cached(obj)
        return obj
    return None


# ---- 배포용 (최신 분기 상세) ----

def build_latest_file(fund: dict, cur: dict, prev: dict | None, cusip_map: dict[str, str]) -> dict:
    """최신 분기 홀딩 + 전분기 대비 변화 → DATA_DIR/funds/{cik}_{quarter}.json"""
    cur_rows = {h["cusip"]: h for h in cur["holdings"]}
    prev_shares = {h["cusip"]: h["shares"] for h in (prev["holdings"] if prev else [])}

    total = sum(h["value"] for h in cur["holdings"]) or 1
    positions = []
    for cusip, v in cur_rows.items():
        prev_sh = prev_shares.get(cusip)
        if prev is None:
            change = "hold"  # 비교 대상 없음 — 신규로 오인하지 않는다
        elif prev_sh is None:
            change = "new"
        elif v["shares"] > prev_sh * 1.0001:
            change = "add"
        elif v["shares"] < prev_sh * 0.9999:
            change = "reduce"
        else:
            change = "hold"
        positions.append(
            {
                "cusip": cusip,
                "ticker": cusip_map.get(cusip),
                "name": v["name"],
                "value": v["value"],
                "shares": v["shares"],
                "weight": round(v["value"] / total, 6),
                "change": change,
                "deltaShares": round(v["shares"] - (prev_sh or 0)),
            }
        )
    # 청산(전분기 보유 → 이번 미보유)
    prev_names = {h["cusip"]: h["name"] for h in (prev["holdings"] if prev else [])}
    for cusip, sh in prev_shares.items():
        if cusip not in cur_rows and sh > 0:
            positions.append(
                {
                    "cusip": cusip, "ticker": cusip_map.get(cusip),
                    "name": prev_names.get(cusip) or cusip,
                    "value": 0, "shares": 0, "weight": 0.0, "change": "exit",
                    "deltaShares": -round(sh),
                }
            )
    positions.sort(key=lambda p: p["weight"], reverse=True)

    holding = {
        "cik": fund["cik"], "name": fund["name"], "quarter": cur["quarter"],
        "filedAt": cur["filedAt"], "aum": round(total),
        "positions": positions,
    }
    io.write_json(f"funds/{fund['cik']}_{cur['quarter']}.json", holding)
    return holding


def build_fund(fund: dict, cusip_map: dict[str, str], quarters: int) -> dict | None:
    name, cik10 = fund["name"], fund["cik"]
    accs = find_13f_accessions(cik10)
    if not accs:
        print(f"  ! {name}: 13F-HR 없음", file=sys.stderr)
        return None

    wanted = accs[:quarters]
    collected: list[dict] = []
    for acc in wanted:
        try:
            got = ensure_quarter(cik10, acc)
            if got:
                collected.append(got)
        except Exception as e:  # noqa: BLE001 — 한 분기 실패가 펀드 전체를 막지 않게
            print(f"    ~ {name} {acc['quarter']} 스킵: {e}", file=sys.stderr)

    if not collected:
        return None
    collected.sort(key=lambda c: c["quarter"])  # 오래된 → 최신
    cur = collected[-1]
    prev = collected[-2] if len(collected) > 1 else None

    holding = build_latest_file(fund, cur, prev, cusip_map)
    return {
        "cik": cik10,
        "name": name,
        "manager": fund.get("manager") or "",
        "category": fund.get("category") or "",
        "latest": cur["quarter"],
        "file": f"{cik10}_{cur['quarter']}.json",
        "aum": holding["aum"],
        "positions": len([p for p in holding["positions"] if p["change"] != "exit"]),
        "filedAt": cur["filedAt"],
        # 성과 계산이 가능한 구간 — Overview 의 inception 열
        "inception": collected[0]["quarter"],
        "quarters": len(collected),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="펀드 개수 제한(테스트)")
    ap.add_argument("--quarters", type=int, default=DEFAULT_QUARTERS, help="펀드당 수집 분기 수")
    args = ap.parse_args()

    funds = load_funds()
    if args.limit:
        funds = funds[: args.limit]

    cusip_map = load_cusip_map()
    index = []
    for fnd in funds:
        try:
            entry = build_fund(fnd, cusip_map, args.quarters)
            if entry:
                index.append(entry)
                print(f"  ✓ {fnd['name']} {entry['latest']} ({entry['positions']} 종목, {entry['quarters']}분기)")
        except Exception as e:  # noqa: BLE001
            print(f"  ! {fnd['name']} 실패: {e}", file=sys.stderr)

    from datetime import date

    io.write_json("funds/index.json", {"asOf": date.today().isoformat(), "funds": index})
    io.update_meta(lastUpdated13F=io.now_kst_iso())
    print(f"완료: 펀드 {len(index)} 처리 (캐시 {CACHE})")


if __name__ == "__main__":
    main()
