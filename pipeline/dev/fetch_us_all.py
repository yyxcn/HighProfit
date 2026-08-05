"""
US 전종목 OHLCV 수집 — yfinance. universe_us.json 전체 대상.
이미 받은 parquet(S&P500 등)은 스킵. 나머지 중소형주까지 차트 가능하게.

  python -m pipeline.dev.fetch_us_all
  python -m pipeline.dev.fetch_us_all --limit 500
"""
from __future__ import annotations

import argparse
import sys
import time

import pandas as pd

from pipeline.lib import io


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--chunk", type=int, default=60)
    ap.add_argument("--no-skip", action="store_true", help="기존 parquet도 다시 받기")
    args = ap.parse_args()

    import yfinance as yf

    uni = io.read_json("universe_us.json", []) or []
    tickers = [u["t"] for u in uni]
    if not args.no_skip:
        tickers = [t for t in tickers if not (io.DATA_DIR / "ohlcv" / "US" / f"{t}.parquet").exists()]
    if args.limit:
        tickers = tickers[: args.limit]
    print(f"US 미수집 대상 {len(tickers)} 종목", flush=True)

    ok = 0
    for i in range(0, len(tickers), args.chunk):
        part = tickers[i : i + args.chunk]
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
                    ok += 1
            except Exception:  # noqa: BLE001
                pass
        print(f"  {min(i + args.chunk, len(tickers))}/{len(tickers)} (성공 {ok})", flush=True)
        time.sleep(0.4)

    io.update_meta(lastUpdatedUS=io.now_kst_iso())
    print(f"완료: US 추가 OHLCV {ok}/{len(tickers)}")


if __name__ == "__main__":
    main()
