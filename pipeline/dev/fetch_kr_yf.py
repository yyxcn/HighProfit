"""
KR 전종목 OHLCV 수집 — yfinance 경유 (pykrx가 이 환경에서 KRX에 막혀서 우회).
universe_kr.json 의 코드에 .KS(코스피)/.KQ(코스닥) 접미사를 붙여 다운로드 → parquet.

  python -m pipeline.dev.fetch_kr_yf              # 전체
  python -m pipeline.dev.fetch_kr_yf --limit 200  # 상위 일부(테스트)
"""
from __future__ import annotations

import argparse
import sys
import time

import pandas as pd

from pipeline.lib import io


def suffix(exchange: str) -> str:
    return ".KS" if exchange == "KOSPI" else ".KQ"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--chunk", type=int, default=50)
    args = ap.parse_args()

    import yfinance as yf

    uni = io.read_json("universe_kr.json", []) or []
    if args.limit:
        uni = uni[: args.limit]
    ymap = {f'{u["t"]}{suffix(u["e"])}': u["t"] for u in uni}
    ytickers = list(ymap.keys())
    print(f"KR 대상 {len(ytickers)} 종목")

    ok = 0
    for i in range(0, len(ytickers), args.chunk):
        part = ytickers[i : i + args.chunk]
        try:
            data = yf.download(part, period="max", auto_adjust=True, group_by="ticker", threads=True, progress=False)
        except Exception as e:  # noqa: BLE001
            print(f"  ! chunk {i} 실패: {e}", file=sys.stderr)
            continue
        for yt in part:
            code = ymap[yt]
            try:
                df = data[yt] if isinstance(data.columns, pd.MultiIndex) else data
                df = df.dropna(how="all").rename(columns=str.lower).reset_index()
                df["date"] = pd.to_datetime(df["Date"] if "Date" in df else df.iloc[:, 0]).dt.strftime("%Y-%m-%d")
                df = df[df["close"] > 0][["date", "open", "high", "low", "close", "volume"]]
                if len(df) > 20:
                    io.write_ohlcv("KR", code, df)
                    ok += 1
            except Exception:  # noqa: BLE001
                pass
        print(f"  {min(i + args.chunk, len(ytickers))}/{len(ytickers)} (성공 {ok})", flush=True)
        time.sleep(0.4)

    io.update_meta(lastUpdatedKR=io.now_kst_iso())
    print(f"완료: KR OHLCV {ok}/{len(ytickers)} 종목")


if __name__ == "__main__":
    main()
