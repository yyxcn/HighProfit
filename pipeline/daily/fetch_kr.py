"""
KR 일간 수집 (명세 5, Phase 1).
- 대상은 **universe_kr.json 전체** (dev/build_full_universe.py 가 KIND 상장법인목록으로 만듦)
- yfinance `.KS`(KOSPI) / `.KQ`(KOSDAQ·KONEX) 로 수정주가 OHLCV → 종목당 parquet
- 수집 로직은 pipeline/lib/yfetch.py 공유 (US 와 동일)

**KR 도 US 와 같은 소스·코드 경로를 쓴다.** 거래소 사이트를 직접 긁는 라이브러리는 쓰지 않는다 —
이력이 3,000행(2014~)에서 잘려 지금(6,649행, 2000~)보다 짧고, 사이트 구조에 묶여 쉽게 깨진다.

사용:
  python -m pipeline.daily.fetch_kr
  python -m pipeline.daily.fetch_kr --tickers 005930,000660
  python -m pipeline.daily.fetch_kr --new-only      # parquet 없는 종목만
"""
from __future__ import annotations

import argparse
import sys

from pipeline.lib import io, yfetch

# yfinance 는 시장별 접미사로 한국 종목을 구분한다. KONEX 는 별도 접미사가 없어 .KQ 로 시도한다
# (대부분 데이터가 없어 미수집으로 빠진다).
SUFFIX = {"KOSPI": ".KS", "KOSDAQ": ".KQ", "KONEX": ".KQ"}


def to_symbol(ticker: str, exchange_of: dict[str, str]) -> str:
    return ticker + SUFFIX.get(exchange_of.get(ticker, ""), ".KS")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tickers", default="", help="쉼표구분 (기본: universe_kr.json 전체)")
    ap.add_argument("--new-only", action="store_true", help="parquet 없는 종목만")
    ap.add_argument("--chunk", type=int, default=60, help="한 요청에 묶을 종목 수 (1=단건)")
    ap.add_argument("--sleep", type=float, default=0.4, help="청크 간 지연(초)")
    ap.add_argument("--min-rows", type=int, default=20, help="이보다 짧은 시계열은 저장 안 함")
    ap.add_argument("--full", action="store_true",
                    help="증분이 아니라 전체 이력 재수집 (월 1회 정합성 점검용)")
    ap.add_argument("--window", default="3mo", help="증분으로 받을 최근 구간")
    args = ap.parse_args()

    universe = io.read_json("universe_kr.json", []) or []
    if not universe:
        print(
            "universe_kr.json 이 없습니다 — dev.build_full_universe 를 먼저 실행하세요.",
            file=sys.stderr,
        )
        sys.exit(1)

    exchange_of = {u["t"]: u.get("e", "") for u in universe}
    tickers = [u["t"] for u in universe]
    if args.tickers:
        want = set(args.tickers.split(","))
        tickers = [t for t in tickers if t in want]
    if args.new_only:
        tickers = [t for t in tickers if not (io.DATA_DIR / "ohlcv" / "KR" / f"{t}.parquet").exists()]

    print(f"KR 대상 {len(tickers)} / 유니버스 {len(universe)} 종목", flush=True)
    yfetch.collect(
        "KR", tickers, lambda t: to_symbol(t, exchange_of),
        chunk=args.chunk, sleep=args.sleep, min_rows=args.min_rows,
        full=args.full, window=args.window,
    )


if __name__ == "__main__":
    main()
