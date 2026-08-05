"""
US 일간 수집 (명세 5, Phase 4).
- config/us_universe.csv 에 정의된 종목만 (전종목 금지 — 명세 5-4)
- yfinance auto_adjust=True 로 수정주가 OHLCV → 종목당 parquet
- universe_us.json (섹터=CSV의 GICS/카테고리)

사용:
  python -m pipeline.daily.fetch_us
  python -m pipeline.daily.fetch_us --tickers AAPL,MSFT
"""
from __future__ import annotations

import argparse
import csv
import sys
import time
from pathlib import Path

import pandas as pd

from pipeline.lib import io

CONFIG = Path(__file__).resolve().parents[1] / "config" / "us_universe.csv"


def load_config() -> list[dict]:
    with CONFIG.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def fetch_one(yf, ticker: str) -> pd.DataFrame | None:
    """yfinance 수정주가. yfinance 티커는 BRK-B → BRK-B 그대로 허용."""
    try:
        df = yf.download(
            ticker, period="max", auto_adjust=True, progress=False, threads=False
        )
    except Exception as e:  # noqa: BLE001
        print(f"  ! {ticker} 실패: {e}", file=sys.stderr)
        return None
    if df is None or df.empty:
        return None
    # 멀티인덱스 컬럼 방어
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    df = df.rename(columns=str.lower).reset_index()
    df["date"] = pd.to_datetime(df["Date"] if "Date" in df else df["index"]).dt.strftime("%Y-%m-%d")
    df = df[df["close"] > 0]
    if df.empty:
        return None
    return df[["date", "open", "high", "low", "close", "volume"]]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tickers", default="", help="쉼표구분 (기본: CSV 전체)")
    ap.add_argument("--sleep", type=float, default=0.3)
    args = ap.parse_args()

    import yfinance as yf

    rows = load_config()
    if args.tickers:
        want = set(args.tickers.split(","))
        rows = [r for r in rows if r["ticker"] in want]

    universe: list[dict] = []
    ok, skipped = 0, 0
    for i, r in enumerate(rows, 1):
        ticker = r["ticker"]
        df = fetch_one(yf, ticker)
        if df is None:
            print(f"  ! {ticker} 데이터 없음", file=sys.stderr)
            continue

        existing = io.DATA_DIR / "ohlcv" / "US" / f"{ticker}.parquet"
        if existing.exists():
            old = pd.read_parquet(existing)
            if not old.empty and old["date"].iloc[-1] == df["date"].iloc[-1]:
                skipped += 1
            else:
                io.write_ohlcv("US", ticker, df)
                ok += 1
        else:
            io.write_ohlcv("US", ticker, df)
            ok += 1

        universe.append(
            {
                "t": ticker, "n": r["name"], "m": "US", "e": r["exchange"],
                "s": r["sector"], "c": int(r["cap_eok"]), "type": r["type"],
            }
        )
        if i % 25 == 0:
            print(f"  {i}/{len(rows)} (신규/갱신 {ok}, 스킵 {skipped})")
        time.sleep(args.sleep)

    io.write_json("universe_us.json", universe)
    io.update_meta(lastUpdatedUS=io.now_kst_iso())
    print(f"완료: US OHLCV {ok} 작성, {skipped} 스킵, universe_us {len(universe)} 항목")


if __name__ == "__main__":
    main()
