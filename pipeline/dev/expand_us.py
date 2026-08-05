"""
US 유니버스를 S&P500 전체로 확장 (개발/초기적재용).
- 위키피디아 S&P500 구성종목(티커/이름/GICS섹터) 수집 → config/us_universe.csv 재생성(+기존 ETF 유지)
- yfinance 로 OHLCV 대량 다운로드 → 종목당 parquet
- fast_info 로 시총(USD) → 억(KRW환산) 저장 → universe_us.json

  python -m pipeline.dev.expand_us
"""
from __future__ import annotations

import csv
import io as _io
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import pandas as pd
import requests

from pipeline.lib import io

CONFIG = Path(__file__).resolve().parents[1] / "config"
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"}
USDKRW = 1300  # 시총 표시 스케일 통일(억 KRW 환산). 정밀 환율 아님.


def sp500() -> list[dict]:
    r = requests.get("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies", headers=UA, timeout=30)
    r.raise_for_status()
    df = pd.read_html(_io.StringIO(r.text))[0]
    out = []
    for _, row in df.iterrows():
        ticker = str(row["Symbol"]).replace(".", "-").strip()  # BRK.B → BRK-B (yfinance)
        out.append({"ticker": ticker, "name": str(row["Security"]).strip(), "sector": str(row["GICS Sector"]).strip()})
    return out


def existing_etfs() -> list[dict]:
    p = CONFIG / "us_universe.csv"
    if not p.exists():
        return []
    with p.open(encoding="utf-8") as f:
        return [r for r in csv.DictReader(f) if r.get("type") == "etf"]


def fetch_cap(ticker: str) -> int:
    try:
        import yfinance as yf

        mc = yf.Ticker(ticker).fast_info.get("market_cap")
        if mc:
            return round(float(mc) * USDKRW / 1e8)  # 억 KRW
    except Exception:  # noqa: BLE001
        pass
    return 0


def bulk_ohlcv(tickers: list[str], chunk: int = 60) -> set[str]:
    import yfinance as yf

    ok: set[str] = set()
    for i in range(0, len(tickers), chunk):
        part = tickers[i : i + chunk]
        try:
            data = yf.download(part, period="max", auto_adjust=True, group_by="ticker", threads=True, progress=False)
        except Exception as e:  # noqa: BLE001
            print(f"  ! chunk {i} 실패: {e}", file=sys.stderr)
            continue
        for t in part:
            try:
                df = data[t] if isinstance(data.columns, pd.MultiIndex) else data
                df = df.dropna(how="all").rename(columns=str.lower).reset_index()
                df["date"] = pd.to_datetime(df["Date"] if "Date" in df else df.iloc[:, 0]).dt.strftime("%Y-%m-%d")
                df = df[df["close"] > 0][["date", "open", "high", "low", "close", "volume"]]
                if len(df) > 20:
                    io.write_ohlcv("US", t, df)
                    ok.add(t)
            except Exception:  # noqa: BLE001
                pass
        print(f"  OHLCV {min(i + chunk, len(tickers))}/{len(tickers)} (성공 {len(ok)})")
        time.sleep(0.5)
    return ok


def main() -> None:
    stocks = sp500()
    etfs = existing_etfs()
    print(f"S&P500 {len(stocks)} 종목 + ETF {len(etfs)}")

    got = bulk_ohlcv([s["ticker"] for s in stocks] + [e["ticker"] for e in etfs])
    stocks = [s for s in stocks if s["ticker"] in got]
    etfs = [e for e in etfs if e["ticker"] in got]
    print(f"OHLCV 확보: 주식 {len(stocks)} / ETF {len(etfs)}, 시총 조회 중…")

    caps: dict[str, int] = {}
    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = {ex.submit(fetch_cap, s["ticker"]): s["ticker"] for s in stocks}
        for f in as_completed(futs):
            caps[futs[f]] = f.result()

    # config/us_universe.csv 재생성 (S&P500 + 기존 ETF)
    with (CONFIG / "us_universe.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["ticker", "name", "exchange", "sector", "cap_eok", "type"])
        for s in stocks:
            w.writerow([s["ticker"], s["name"], "US", s["sector"], caps.get(s["ticker"], 0), "stock"])
        for e in etfs:
            w.writerow([e["ticker"], e["name"], e["exchange"], e["sector"], e["cap_eok"], e["type"]])

    # universe_us.json
    universe = [
        {"t": s["ticker"], "n": s["name"], "m": "US", "e": "US", "s": s["sector"],
         "c": caps.get(s["ticker"], 0), "type": "stock"}
        for s in stocks
    ]
    for e in etfs:
        # ETF OHLCV 도 확보(아직 없으면)
        universe.append({"t": e["ticker"], "n": e["name"], "m": "US", "e": e["exchange"],
                         "s": e["sector"], "c": int(e["cap_eok"]), "type": "etf"})
    io.write_json("universe_us.json", universe)
    io.update_meta(lastUpdatedUS=io.now_kst_iso())
    print(f"완료: US 유니버스 {len(universe)} (주식 {len(stocks)} + ETF {len(etfs)})")


if __name__ == "__main__":
    main()
