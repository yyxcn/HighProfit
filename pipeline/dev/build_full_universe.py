"""
전종목 검색 유니버스 구축 (US 전체상장 + KR 전체상장).
- US: nasdaqtrader 심볼 디렉토리(~13k). 기존 S&P500 시총/섹터는 보존.
- KR: KRX KIND 상장법인목록(~2.8k, 이름·코드·시장·업종). yfinance .KS/.KQ 로 시세 수집 가능.
시세(OHLCV)는 별도(fetch 스크립트)에서. 여기서는 검색 인덱스만 즉시 만든다.

  python -m pipeline.dev.build_full_universe
"""
from __future__ import annotations

import io as _io

import pandas as pd
import requests

from pipeline.lib import io

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"}


def us_symbols() -> list[dict]:
    out: list[dict] = []
    # NASDAQ
    r = requests.get("https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt", headers=UA, timeout=30)
    df = pd.read_csv(_io.StringIO(r.text), sep="|")
    df = df[df["Test Issue"] == "N"]
    for _, x in df.iterrows():
        sym = str(x["Symbol"]).strip()
        if not sym or "File Creation" in sym:
            continue
        out.append({"t": sym, "n": str(x["Security Name"]).split(" - ")[0].strip(), "m": "US",
                    "e": "NASDAQ", "s": "기타", "c": 0, "type": "etf" if x.get("ETF") == "Y" else "stock"})
    # NYSE/AMEX 등
    r2 = requests.get("https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt", headers=UA, timeout=30)
    df2 = pd.read_csv(_io.StringIO(r2.text), sep="|")
    df2 = df2[df2["Test Issue"] == "N"]
    for _, x in df2.iterrows():
        sym = str(x["ACT Symbol"]).strip().replace(".", "-")
        if not sym or "File Creation" in sym:
            continue
        out.append({"t": sym, "n": str(x["Security Name"]).split(" - ")[0].strip(), "m": "US",
                    "e": str(x.get("Exchange", "")), "s": "기타", "c": 0, "type": "etf" if x.get("ETF") == "Y" else "stock"})
    return out


MARKET_MAP = {"유가증권": "KOSPI", "코스닥": "KOSDAQ", "코넥스": "KONEX"}


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
        out.append({"t": code, "n": str(x["회사명"]).strip(), "m": "KR",
                    "e": MARKET_MAP.get(str(x["시장구분"]).strip(), "KRX"),
                    "s": str(x.get("업종", "기타")).strip() or "기타", "c": 0, "type": "stock"})
    return out


def main() -> None:
    us = us_symbols()
    kr = kr_symbols()
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
