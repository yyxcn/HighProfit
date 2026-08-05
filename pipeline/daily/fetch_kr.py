"""
KR 일간 수집 (명세 5, Phase 1).
- pykrx 로 KOSPI+KOSDAQ 전종목 수정주가 OHLCV 를 종목당 parquet 로 저장
- 시총·종목명·시장 수집 → universe_kr.json (섹터는 build_universe 가 보강)
- 휴장일이면(최신 봉이 직전 영업일과 동일) 스킵

사용:
  python -m pipeline.daily.fetch_kr                 # 전종목
  python -m pipeline.daily.fetch_kr --limit 50      # 상위 50 (테스트)
  python -m pipeline.daily.fetch_kr --tickers 005930,000660
"""
from __future__ import annotations

import argparse
import sys
import time
from datetime import datetime, timedelta

import pandas as pd

from pipeline.lib import io

START = "19900101"  # 상장 이후 전체. pykrx 가 알아서 상장일부터 반환.


def _today() -> str:
    return datetime.now().strftime("%Y%m%d")


def fetch_one(stock, ticker: str, start: str, end: str) -> pd.DataFrame | None:
    """단일 종목 수정주가 OHLCV. 실패 시 None."""
    try:
        df = stock.get_market_ohlcv(start, end, ticker, adjusted=True)
    except Exception as e:  # noqa: BLE001
        print(f"  ! {ticker} OHLCV 실패: {e}", file=sys.stderr)
        return None
    if df is None or df.empty:
        return None
    df = df.rename(
        columns={"시가": "open", "고가": "high", "저가": "low", "종가": "close", "거래량": "volume"}
    )
    df = df[df["close"] > 0].copy()
    if df.empty:
        return None
    df["date"] = df.index.strftime("%Y-%m-%d")
    return df[["date", "open", "high", "low", "close", "volume"]]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="상위 N 종목만 (0=전체)")
    ap.add_argument("--tickers", type=str, default="", help="쉼표구분 티커 목록")
    ap.add_argument("--sleep", type=float, default=0.1, help="요청 간 지연(초)")
    args = ap.parse_args()

    from pykrx import stock

    end = _today()
    prev_bday = (datetime.now() - timedelta(days=1)).strftime("%Y%m%d")

    # 종목 목록 + 시총 (KOSPI, KOSDAQ)
    universe_rows: list[dict] = []
    tickers: list[tuple[str, str]] = []  # (ticker, market)
    for market in ("KOSPI", "KOSDAQ"):
        for t in stock.get_market_ticker_list(end, market=market):
            tickers.append((t, market))

    if args.tickers:
        want = set(args.tickers.split(","))
        tickers = [(t, m) for (t, m) in tickers if t in want]
    if args.limit:
        # 시총 상위 우선: 시총으로 정렬
        cap = stock.get_market_cap_by_ticker(end)
        order = {t: i for i, t in enumerate(cap.sort_values("시가총액", ascending=False).index)}
        tickers.sort(key=lambda tm: order.get(tm[0], 1 << 30))
        tickers = tickers[: args.limit]

    print(f"KR 대상 종목: {len(tickers)}")

    cap_df = stock.get_market_cap_by_ticker(end)
    ok, skipped = 0, 0
    for i, (ticker, market) in enumerate(tickers, 1):
        df = fetch_one(stock, ticker, START, end)
        if df is None:
            continue

        # 휴장일 스킵: 기존 parquet 의 마지막 날짜와 동일하면 재작성 안 함
        existing = io.DATA_DIR / "ohlcv" / "KR" / f"{ticker}.parquet"
        if existing.exists():
            old = pd.read_parquet(existing)
            if not old.empty and old["date"].iloc[-1] == df["date"].iloc[-1]:
                skipped += 1
            else:
                io.write_ohlcv("KR", ticker, df)
                ok += 1
        else:
            io.write_ohlcv("KR", ticker, df)
            ok += 1

        name = stock.get_market_ticker_name(ticker)
        try:
            cap_eok = int(round(float(cap_df.loc[ticker, "시가총액"]) / 1e8))
        except Exception:  # noqa: BLE001
            cap_eok = 0
        universe_rows.append(
            {
                "t": ticker,
                "n": name,
                "m": "KR",
                "e": market,
                "s": "기타",  # build_universe/build_sectors 가 KRX 업종으로 보강
                "c": cap_eok,
                "type": "etf" if _looks_etf(name) else "stock",
            }
        )
        if i % 100 == 0:
            print(f"  {i}/{len(tickers)} (신규/갱신 {ok}, 스킵 {skipped})")
        time.sleep(args.sleep)

    io.write_json("universe_kr.json", universe_rows)
    io.update_meta(lastUpdatedKR=io.now_kst_iso())
    print(f"완료: KR OHLCV {ok} 파일 작성, {skipped} 스킵, universe_kr {len(universe_rows)} 항목")
    if ok == 0 and skipped == 0:
        print("경고: 수집된 종목이 없습니다. 휴장일이거나 pykrx 접근 문제.", file=sys.stderr)


ETF_HINTS = ("KODEX", "TIGER", "KBSTAR", "ARIRANG", "HANARO", "SOL ", "PLUS ", "ACE ", "RISE ", "ETF")


def _looks_etf(name: str) -> bool:
    up = name.upper()
    return any(h.strip() and h in up for h in ETF_HINTS)


if __name__ == "__main__":
    main()
