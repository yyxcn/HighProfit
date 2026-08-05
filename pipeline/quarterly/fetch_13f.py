"""
SEC EDGAR 13F-HR 수집 (명세 6-5, Phase 8). 분기 1회.
- config/funds.csv 의 CIK 순회 → 최신 13F-HR + 직전 분기
- INFORMATION TABLE xml 파싱 → 보유내역
- cusip→ticker 매핑(config/cusip_map.csv, 미매핑은 이름 노출)
- 비중 = value/총합, 전분기 대비 신규/증가/감소/청산 산출
- User-Agent 필수, 요청 간 지연으로 rate limit 준수

  SEC_USER_AGENT="HighProfit you@example.com" python -m pipeline.quarterly.fetch_13f
  ... --limit 1   # 테스트
"""
from __future__ import annotations

import argparse
import csv
import os
import re
import sys
import time
from pathlib import Path
from xml.etree import ElementTree as ET

import requests

from pipeline.lib import io

CONFIG = Path(__file__).resolve().parents[1] / "config"
UA = os.environ.get("SEC_USER_AGENT", "HighProfit contact@example.com")
SLEEP = 0.15  # 초당 <10요청


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


def quarter_of(report_date: str) -> str:
    y, m = report_date[:4], int(report_date[5:7])
    return f"{y}Q{(m - 1) // 3 + 1}"


def find_13f_accessions(cik10: str) -> list[dict]:
    """최신순 13F-HR 목록 [{accession, reportDate, filingDate}]."""
    data = _get(f"https://data.sec.gov/submissions/CIK{cik10}.json", as_json=True)
    recent = data["filings"]["recent"]
    out = []
    for form, acc, rep, fil in zip(
        recent["form"], recent["accessionNumber"], recent["reportDate"], recent["filingDate"]
    ):
        if form == "13F-HR":
            out.append({"accession": acc, "reportDate": rep, "filingDate": fil})
    return out


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
            }
        )
    return rows


def aggregate(rows: list[dict]) -> dict[str, dict]:
    """cusip 별 합산 (여러 클래스 합침)."""
    agg: dict[str, dict] = {}
    for r in rows:
        a = agg.setdefault(r["cusip"], {"name": r["name"], "value": 0.0, "shares": 0.0})
        a["value"] += r["value"]
        a["shares"] += r["shares"]
    return agg


def build_fund(name: str, cik10: str, cusip_map: dict[str, str]) -> dict | None:
    accs = find_13f_accessions(cik10)
    if not accs:
        print(f"  ! {name}: 13F-HR 없음", file=sys.stderr)
        return None
    cur = accs[0]
    cik_int = int(cik10)
    cur_rows = aggregate(fetch_info_table(cik_int, cur["accession"]))
    prev_shares: dict[str, float] = {}
    if len(accs) > 1:
        prev_shares = {c: v["shares"] for c, v in aggregate(fetch_info_table(cik_int, accs[1]["accession"])).items()}

    total = sum(v["value"] for v in cur_rows.values()) or 1
    positions = []
    for cusip, v in cur_rows.items():
        prev = prev_shares.get(cusip)
        if prev is None:
            change = "new"
        elif v["shares"] > prev * 1.0001:
            change = "add"
        elif v["shares"] < prev * 0.9999:
            change = "reduce"
        else:
            change = "hold"
        positions.append(
            {
                "cusip": cusip,
                "ticker": cusip_map.get(cusip),
                "name": v["name"],
                "value": round(v["value"]),
                "shares": round(v["shares"]),
                "weight": round(v["value"] / total, 6),
                "change": change,
                "deltaShares": round(v["shares"] - (prev or 0)),
            }
        )
    # 청산(전분기 보유 → 이번 미보유)
    for cusip, sh in prev_shares.items():
        if cusip not in cur_rows and sh > 0:
            positions.append(
                {
                    "cusip": cusip, "ticker": cusip_map.get(cusip), "name": cusip,
                    "value": 0, "shares": 0, "weight": 0.0, "change": "exit",
                    "deltaShares": -round(sh),
                }
            )
    positions.sort(key=lambda p: p["weight"], reverse=True)

    quarter = quarter_of(cur["reportDate"])
    holding = {
        "cik": cik10, "name": name, "quarter": quarter,
        "filedAt": cur["filingDate"], "aum": round(total),
        "positions": positions,
    }
    io.write_json(f"funds/{cik10}_{quarter}.json", holding)
    return {
        "cik": cik10, "name": name, "latest": quarter,
        "file": f"{cik10}_{quarter}.json", "aum": round(total),
        "positions": len([p for p in positions if p["change"] != "exit"]),
        "filedAt": cur["filingDate"],
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    with (CONFIG / "funds.csv").open(encoding="utf-8") as f:
        funds = list(csv.DictReader(f))
    if args.limit:
        funds = funds[: args.limit]

    cusip_map = load_cusip_map()
    index = []
    for fnd in funds:
        try:
            entry = build_fund(fnd["name"], fnd["cik"].strip(), cusip_map)
            if entry:
                index.append(entry)
                print(f"  ✓ {fnd['name']} {entry['latest']} ({entry['positions']} 종목)")
        except Exception as e:  # noqa: BLE001
            print(f"  ! {fnd['name']} 실패: {e}", file=sys.stderr)

    from datetime import date

    io.write_json("funds/index.json", {"asOf": date.today().isoformat(), "funds": index})
    io.update_meta(lastUpdated13F=io.now_kst_iso())
    print(f"완료: 펀드 {len(index)} 처리")


if __name__ == "__main__":
    main()
