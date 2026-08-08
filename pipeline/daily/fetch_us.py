"""
US 일간 수집 (명세 5, Phase 4).
- 대상은 **universe_us.json 전체** (dev/build_full_universe.py 가 만든 전종목 인덱스)
- yfinance auto_adjust=True 로 수정주가 OHLCV → 종목당 parquet
- 수집 로직은 pipeline/lib/yfetch.py 공유 (KR 과 동일)

사용:
  python -m pipeline.daily.fetch_us
  python -m pipeline.daily.fetch_us --tickers AAPL,MSFT
  python -m pipeline.daily.fetch_us --new-only      # parquet 없는 종목만(초기적재 이어하기)
  python -m pipeline.daily.fetch_us --min-rows 5    # 신규상장도 저장(기본 20)
"""
from __future__ import annotations

import argparse
import sys

from pipeline.lib import io, yfetch


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tickers", default="", help="쉼표구분 (기본: universe_us.json 전체)")
    ap.add_argument("--new-only", action="store_true", help="parquet 없는 종목만")
    ap.add_argument("--chunk", type=int, default=60, help="한 요청에 묶을 종목 수 (1=단건)")
    ap.add_argument("--sleep", type=float, default=0.4, help="청크 간 지연(초)")
    ap.add_argument("--min-rows", type=int, default=20, help="이보다 짧은 시계열은 저장 안 함")
    ap.add_argument("--full", action="store_true",
                    help="증분이 아니라 전체 이력 재수집 (월 1회 정합성 점검용)")
    ap.add_argument("--window", default="3mo", help="증분으로 받을 최근 구간")
    args = ap.parse_args()

    universe = io.read_json("universe_us.json", []) or []
    if not universe:
        print(
            "universe_us.json 이 없습니다 — dev.build_full_universe 를 먼저 실행하세요.",
            file=sys.stderr,
        )
        sys.exit(1)

    tickers = [u["t"] for u in universe]
    if args.tickers:
        want = set(args.tickers.split(","))
        tickers = [t for t in tickers if t in want]
    if args.new_only:
        tickers = [t for t in tickers if not (io.DATA_DIR / "ohlcv" / "US" / f"{t}.parquet").exists()]

    print(f"US 대상 {len(tickers)} / 유니버스 {len(universe)} 종목", flush=True)
    yfetch.collect(
        "US", tickers, lambda t: t,
        chunk=args.chunk, sleep=args.sleep, min_rows=args.min_rows,
        full=args.full, window=args.window,
    )


if __name__ == "__main__":
    main()
