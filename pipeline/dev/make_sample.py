"""
로컬 개발용 합성 데이터 생성 (외부 API/R2 불필요).
파이프라인 산출물과 동일한 레이아웃을 만들어 웹앱을 end-to-end 로 검증한다.
실데이터가 아니며, KRX 재배포/yfinance 라이선스(명세 9) 회피 목적도 겸한다.

  python -m pipeline.dev.make_sample            # data/ 에 생성
  python -m pipeline.dev.make_sample --publish  # apps/web/public/data 로 복사까지

생성물: ohlcv/{KR,US}/*.parquet, universe.json, sectors/*.json, funds/*, meta.json
"""
from __future__ import annotations

import argparse
import math
import shutil
from datetime import date

import numpy as np
import pandas as pd

from pipeline.lib import io

# (ticker, name, market, exchange, sector, cap억, type, drift연, vol연, seedphase)
KR = [
    ("005930", "삼성전자", "KOSPI", "반도체", 4_200_000, 0.08, 0.28, 0.1),
    ("000660", "SK하이닉스", "KOSPI", "반도체", 1_100_000, 0.12, 0.38, 0.2),
    ("373220", "LG에너지솔루션", "KOSPI", "2차전지", 900_000, 0.10, 0.40, 0.3),
    ("207940", "삼성바이오로직스", "KOSPI", "바이오", 700_000, 0.11, 0.33, 0.5),
    ("005380", "현대차", "KOSPI", "자동차", 500_000, 0.06, 0.30, 0.7),
    ("035420", "NAVER", "KOSPI", "인터넷", 350_000, 0.07, 0.36, 0.9),
    ("035720", "카카오", "KOSPI", "인터넷", 220_000, 0.05, 0.44, 1.1),
    ("051910", "LG화학", "KOSPI", "화학", 300_000, 0.05, 0.34, 1.3),
    ("006400", "삼성SDI", "KOSPI", "2차전지", 260_000, 0.09, 0.42, 1.5),
    ("105560", "KB금융", "KOSPI", "금융", 320_000, 0.07, 0.26, 1.7),
    ("055550", "신한지주", "KOSPI", "금융", 250_000, 0.06, 0.25, 1.9),
    ("068270", "셀트리온", "KOSPI", "바이오", 400_000, 0.08, 0.37, 2.1),
]
KR_ETF = [
    ("069500", "KODEX 200", "KOSPI", "국내주식", 60_000, 0.06, 0.20, 0.4),
    ("229200", "KODEX 코스닥150", "KOSDAQ", "국내주식", 12_000, 0.05, 0.30, 0.6),
]
US = [
    ("AAPL", "Apple", "NASDAQ", "Information Technology", 3_400_000, 0.18, 0.28, 0.15),
    ("MSFT", "Microsoft", "NASDAQ", "Information Technology", 3_200_000, 0.17, 0.26, 0.35),
    ("NVDA", "NVIDIA", "NASDAQ", "Information Technology", 3_000_000, 0.30, 0.45, 0.55),
    ("AMZN", "Amazon", "NASDAQ", "Consumer Discretionary", 1_900_000, 0.16, 0.32, 0.75),
    ("GOOGL", "Alphabet", "NASDAQ", "Communication Services", 2_100_000, 0.15, 0.29, 0.95),
    ("META", "Meta Platforms", "NASDAQ", "Communication Services", 1_300_000, 0.14, 0.38, 1.15),
    ("TSLA", "Tesla", "NASDAQ", "Consumer Discretionary", 800_000, 0.20, 0.55, 1.35),
]
US_ETF = [
    ("SPY", "SPDR S&P 500", "NYSE", "전략", 500_000, 0.10, 0.18, 0.25),
    ("QQQ", "Invesco QQQ", "NASDAQ", "전략", 300_000, 0.14, 0.24, 0.45),
]

PERIODS = {"1d": 1, "5d": 5, "1m": 21, "3m": 63, "6m": 126, "1y": 252}


def gen_bars(seed: int, drift: float, vol: float, phase: float, start="2013-01-01") -> pd.DataFrame:
    """영업일 GBM + 연간 계절성 overlay. 수정주가 가정(연속)."""
    rng = np.random.default_rng(seed)
    days = pd.bdate_range(start=start, end=date.today())
    n = len(days)
    dt = 1 / 252
    mu = drift
    doy = days.dayofyear.to_numpy() / 365.25
    seasonal = 0.05 * np.sin(2 * math.pi * (doy + phase))  # ±5% 연간 파동
    shocks = rng.normal(0, 1, n)
    log_ret = (mu - 0.5 * vol**2) * dt + vol * math.sqrt(dt) * shocks
    log_ret[1:] += np.diff(seasonal)  # 계절 성분을 수익률에 주입
    price = 100 * np.exp(np.cumsum(log_ret))
    intraday = 1 + rng.normal(0, vol * math.sqrt(dt) * 0.5, n)
    high = price * np.abs(1 + rng.uniform(0, vol * 0.03, n))
    low = price * np.abs(1 - rng.uniform(0, vol * 0.03, n))
    open_ = price * intraday
    vols = rng.integers(1_000_00, 50_000_00, n)
    return pd.DataFrame(
        {
            "date": days.strftime("%Y-%m-%d"),
            "open": open_,
            "high": np.maximum.reduce([high, price, open_]),
            "low": np.minimum.reduce([low, price, open_]),
            "close": price,
            "volume": vols,
        }
    )


def period_return(df: pd.DataFrame, lookback: int) -> float:
    c = df["close"].to_numpy()
    if len(c) <= lookback:
        return 0.0
    return float(c[-1] / c[-1 - lookback] - 1)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--publish", action="store_true", help="apps/web/public/data 로 복사")
    args = ap.parse_args()

    universe: list[dict] = []
    bars_by: dict[tuple[str, str], pd.DataFrame] = {}

    def emit(market_dir, rows, sec_type):
        for i, (t, n, exch, sector, cap, drift, vol, phase) in enumerate(rows):
            seed = abs(hash((t, market_dir))) % (2**31)
            df = gen_bars(seed, drift, vol, phase)
            io.write_ohlcv(market_dir, t, df)
            bars_by[(market_dir, t)] = df
            universe.append(
                {
                    "t": t, "n": n, "m": market_dir, "e": exch,
                    "s": sector, "c": cap, "type": sec_type,
                }
            )

    emit("KR", KR, "stock")
    emit("KR", KR_ETF, "etf")
    emit("US", US, "stock")
    emit("US", US_ETF, "etf")

    universe.sort(key=lambda r: r["c"], reverse=True)
    io.write_json("universe.json", universe)

    build_sectors(universe, bars_by)
    build_funds(bars_by)

    io.update_meta(
        lastUpdatedKR=io.now_kst_iso(),
        lastUpdatedUS=io.now_kst_iso(),
        lastUpdated13F=io.now_kst_iso(),
    )
    print(f"샘플 생성 완료: {len(universe)} 종목, {io.DATA_DIR}")

    if args.publish:
        dest = io.REPO_ROOT / "apps" / "web" / "public" / "data"
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(io.DATA_DIR, dest)
        print(f"게시: {dest}")


def _sector_returns(df: pd.DataFrame) -> dict:
    return {p: round(period_return(df, lb), 6) for p, lb in PERIODS.items()}


def build_sectors(universe: list[dict], bars_by: dict) -> None:
    """시총가중 섹터 수익률 사전집계 (명세 5-5)."""
    for scope in ("KR", "US", "ETF"):
        if scope == "ETF":
            items = [u for u in universe if u["type"] == "etf"]
        else:
            items = [u for u in universe if u["m"] == scope and u["type"] == "stock"]
        groups: dict[str, list[dict]] = {}
        for u in items:
            groups.setdefault(u["s"], []).append(u)

        sectors = []
        for name, members in groups.items():
            consts = []
            total_cap = sum(m["c"] for m in members) or 1
            for m in members:
                mkt = m["m"]
                df = bars_by[(mkt, m["t"])]
                consts.append({"t": m["t"], "n": m["n"], "m": mkt, "cap": m["c"], "ret": _sector_returns(df)})
            # 시총가중 섹터 수익률
            sec_ret = {}
            for p in PERIODS:
                sec_ret[p] = round(
                    sum(c["cap"] * c["ret"][p] for c in consts) / total_cap, 6
                )
            consts.sort(key=lambda c: c["cap"], reverse=True)
            sectors.append(
                {"name": name, "cap": total_cap, "ret": sec_ret, "top": consts[:20]}
            )
        sectors.sort(key=lambda s: s["cap"], reverse=True)
        io.write_json(f"sectors/{scope}.json", {"asOf": date.today().isoformat(), "sectors": sectors})


def build_funds(bars_by: dict) -> None:
    """샘플 13F (명세 6-5 스키마). 실제 공시 아님."""
    us_tickers = [("AAPL", "Apple Inc"), ("MSFT", "Microsoft Corp"),
                  ("NVDA", "NVIDIA Corp"), ("AMZN", "Amazon.com Inc")]
    quarter = "2026Q2"
    cik = "0001067983"
    positions = []
    weights = [0.42, 0.23, 0.20, 0.15]
    changes = ["add", "reduce", "new", "add"]
    aum = 300_000_000  # 천 단위 (USD thousands)
    for (t, name), w, ch in zip(us_tickers, weights, changes):
        px = float(bars_by[("US", t)]["close"].iloc[-1])
        value = int(aum * w)
        positions.append(
            {
                "cusip": f"{t}0000000"[:9], "ticker": t, "name": name,
                "value": value, "shares": int(value * 1000 / px),
                "weight": w, "change": ch, "deltaShares": 12345 if ch != "reduce" else -6789,
            }
        )
    holding = {
        "cik": cik, "name": "Berkshire Hathaway (샘플)", "quarter": quarter,
        "filedAt": "2026-08-14", "aum": aum, "positions": positions,
    }
    io.write_json(f"funds/{cik}_{quarter}.json", holding)
    io.write_json(
        "funds/index.json",
        {
            "asOf": date.today().isoformat(),
            "funds": [
                {
                    "cik": cik, "name": "Berkshire Hathaway (샘플)", "latest": quarter,
                    "file": f"{cik}_{quarter}.json", "aum": aum,
                    "positions": len(positions), "filedAt": "2026-08-14",
                }
            ],
        },
    )


if __name__ == "__main__":
    main()
