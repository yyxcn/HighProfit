"""
전종목 검색 유니버스 구축 (US 전체상장 + KR 전체상장).
- US: nasdaqtrader 심볼 디렉토리(~13k). 기존 S&P500 시총/섹터는 보존.
- KR: KRX KIND 상장법인목록(~2.8k, 이름·코드·시장·업종). yfinance .KS/.KQ 로 시세 수집 가능.
시세(OHLCV)는 별도(fetch 스크립트)에서. 여기서는 검색 인덱스만 즉시 만든다.

  python -m pipeline.dev.build_full_universe
"""
from __future__ import annotations

import io as _io
import re

import pandas as pd
import requests

from pipeline.lib import io

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"}

# 주식이 아닌 상품 — 시세 대시보드에서 볼 이유가 없고 검색 결과만 오염시킨다.
# nasdaqtrader 의 Security Name 은 "회사명 - 상품종류" 형식이라 뒤쪽으로 판별한다.
# ADR(American Depositary Shares)은 정상 주식이므로 제외하지 않는다(BABA, TM 등).
# 단어경계 필수: \bunits?\b 가 아니면 "United ..." 가 걸린다.

# 예외 없이 제외 — 채권이거나 보통주가 아닌 것.
HARD = re.compile(
    r"\b(warrants?|rights?|preferreds?|debentures?|notes?|subordinated)\b", re.I
)
# "Units" 는 두 가지가 같은 단어를 쓴다:
#   · SPAC 의 임시 묶음("Artius II Acquisition Inc. - Units")        → 제외
#   · MLP/LP 의 보통지분("Energy Transfer LP Common Units")          → 유지
# 구분 없이 걸면 ET·MPLX·WES·SUN 같은 대형 파트너십이 통째로 사라진다.
UNIT = re.compile(r"\bunits?\b", re.I)
PARTNERSHIP = re.compile(
    r"\b(common units?|limited partner)\b|L\.P\.|(?<![A-Za-z])LP(?![A-Za-z])", re.I
)


def is_non_equity(name: str) -> bool:
    if HARD.search(name):
        return True
    return bool(UNIT.search(name)) and not PARTNERSHIP.search(name)


def _row(sym: str, name: str, exchange: str, is_etf: bool) -> dict | None:
    """심볼 1건 → universe 항목. 비주식 상품이면 None."""
    sym = sym.strip()
    if not sym or "File Creation" in sym:
        return None
    if is_non_equity(name):
        return None
    return {"t": sym, "n": name.split(" - ")[0].strip(), "m": "US",
            "e": exchange, "s": "기타", "c": 0, "type": "etf" if is_etf else "stock"}


def us_symbols() -> list[dict]:
    out: list[dict] = []
    dropped = 0
    # NASDAQ
    r = requests.get("https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt", headers=UA, timeout=30)
    df = pd.read_csv(_io.StringIO(r.text), sep="|")
    df = df[df["Test Issue"] == "N"]
    for _, x in df.iterrows():
        row = _row(str(x["Symbol"]), str(x["Security Name"]), "NASDAQ", x.get("ETF") == "Y")
        if row:
            out.append(row)
        else:
            dropped += 1
    # NYSE/AMEX 등
    r2 = requests.get("https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt", headers=UA, timeout=30)
    df2 = pd.read_csv(_io.StringIO(r2.text), sep="|")
    df2 = df2[df2["Test Issue"] == "N"]
    for _, x in df2.iterrows():
        row = _row(str(x["ACT Symbol"]).replace(".", "-"), str(x["Security Name"]),
                   str(x.get("Exchange", "")), x.get("ETF") == "Y")
        if row:
            out.append(row)
        else:
            dropped += 1
    print(f"  비주식 상품 제외: {dropped}건 (워런트·권리증서·유닛·우선주·채권)")
    return out


# KIND 의 실제 시장구분 값은 "유가"("유가증권" 아님)·"코스닥"·"코넥스" 다.
# 매핑에 없으면 fetch_kr 이 접미사를 못 정해 KOSDAQ 종목을 .KS 로 잘못 요청한다.
MARKET_MAP = {"유가": "KOSPI", "유가증권": "KOSPI", "코스닥": "KOSDAQ", "코넥스": "KONEX"}


def kr_symbols() -> list[dict]:
    url = "http://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13"
    r = requests.get(url, headers=UA, timeout=30)
    df = pd.read_html(_io.BytesIO(r.content), encoding="euc-kr")[0]
    df["code"] = df["종목코드"].astype(str).str.zfill(6)
    out = []
    for _, x in df.iterrows():
        code = x["code"]
        if not code.isdigit():  # 우선주/특수코드(letter 포함) 제외 — yfinance 미지원
            continue
        # 섹터는 비워둔다("기타"). KIND 업종은 한국표준산업분류 세분류(159종)라 히트맵이
        # 잘게 쪼개지고 US 의 GICS 11개와 축이 어긋난다. 섹터는 dev/enrich_meta.py 가
        # yfinance GICS 로 채우고, 못 받은 종목은 "기타" 한 덩어리로 남는다.
        out.append({"t": code, "n": str(x["회사명"]).strip(), "m": "KR",
                    "e": MARKET_MAP.get(str(x["시장구분"]).strip(), "KRX"),
                    "s": "기타", "c": 0, "type": "stock"})
    return out


def dedupe(rows: list[dict]) -> list[dict]:
    """티커 중복 제거. KIND 는 같은 회사를 두 번 반환하는 경우가 있고(실측 42건),
    그대로 두면 검색에 같은 종목이 두 번 뜨고 섹터 집계에서 시총이 이중 계산된다."""
    seen: dict[str, dict] = {}
    for r in rows:
        seen.setdefault(r["t"], r)
    return list(seen.values())


def main() -> None:
    us = dedupe(us_symbols())
    kr = dedupe(kr_symbols())
    print(f"US {len(us)}, KR {len(kr)} 심볼")

    # 기존 시총/섹터(S&P500) 보존: universe_us.json 의 c>0 항목으로 덮어쓰기
    prev = {f'{u["m"]}:{u["t"]}': u for u in (io.read_json("universe_us.json", []) or [])}
    prev.update({f'{u["m"]}:{u["t"]}': u for u in (io.read_json("universe_kr.json", []) or []) if u.get("c", 0) > 0})
    for u in us + kr:
        p = prev.get(f'{u["m"]}:{u["t"]}')
        if p and p.get("c", 0) > 0:
            u["c"] = p["c"]
            if p.get("s") and p["s"] != "기타":
                u["s"] = p["s"]

    universe = us + kr
    universe.sort(key=lambda r: r["c"], reverse=True)
    io.write_json("universe.json", universe)
    io.write_json("universe_us.json", us)
    io.write_json("universe_kr.json", kr)
    print(f"universe.json: {len(universe)} 종목 (US {len(us)} + KR {len(kr)})")


if __name__ == "__main__":
    main()
