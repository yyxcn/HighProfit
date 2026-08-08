"""
히트맵용 섹터 사전집계 (명세 5-5, Phase 4).
universe.json + 종목별 parquet 를 읽어 섹터별 시총가중 기간수익률을 계산.
브라우저에서 전종목 집계는 불가하므로 파이프라인에서 미리 만든다.

  python -m pipeline.daily.build_sectors                 # US/ETF (+KR if 섹터 존재)

산출: sectors/KR.json, sectors/US.json, sectors/ETF.json
섹터 수익률 = 구성종목 시총가중 평균 (단순평균 금지 — 소형주 노이즈).
"""
from __future__ import annotations

import sys
from datetime import date

import pandas as pd

from pipeline.lib import io

PERIODS = {"1d": 1, "5d": 5, "1m": 21, "3m": 63, "6m": 126, "1y": 252}


def period_return(df: pd.DataFrame, lookback: int) -> float:
    c = df["close"].to_numpy()
    if len(c) <= lookback:
        return 0.0
    return float(c[-1] / c[-1 - lookback] - 1)


def sector_returns_of(df: pd.DataFrame) -> dict:
    return {p: round(period_return(df, lb), 6) for p, lb in PERIODS.items()}


def load_bars(market: str, ticker: str) -> pd.DataFrame | None:
    p = io.DATA_DIR / "ohlcv" / market / f"{ticker}.parquet"
    if not p.exists():
        return None
    return pd.read_parquet(p)


def build_scope(scope: str, universe: list[dict]) -> None:
    if scope == "ETF":
        items = [u for u in universe if u.get("type") == "etf"]
    else:
        items = [u for u in universe if u.get("m") == scope and u.get("type") == "stock"]

    groups: dict[str, list[dict]] = {}
    for u in items:
        groups.setdefault(u.get("s", "기타"), []).append(u)

    sectors = []
    for name, members in groups.items():
        consts = []
        for m in members:
            if m.get("c", 0) <= 0:
                continue  # 시총 없는 종목 제외(히트맵 면적/가중 불가)
            df = load_bars(m["m"], m["t"])
            if df is None or df.empty:
                continue
            consts.append({"t": m["t"], "n": m["n"], "m": m["m"], "cap": m.get("c", 0), "ret": sector_returns_of(df)})
        if not consts:
            continue
        total_cap = sum(c["cap"] for c in consts) or 1
        sec_ret = {
            p: round(sum(c["cap"] * c["ret"][p] for c in consts) / total_cap, 6) for p in PERIODS
        }
        consts.sort(key=lambda c: c["cap"], reverse=True)
        # top 은 섹터 드릴다운(트리맵에서 섹터 클릭 시 개별 종목 화면)의 데이터 소스다.
        # 20 개면 화면이 휑해서 50 으로 둔다. 늘리면 sectors/*.json 이 그만큼 커진다.
        sectors.append({"name": name, "cap": total_cap, "ret": sec_ret, "top": consts[:50]})

    if not sectors:
        # 빈 결과로 R2 의 정상 파일을 덮어쓰지 않는다 (교차 워크플로 안전)
        print(f"  sectors/{scope}.json: 데이터 없음 — 스킵(기존 파일 보존)")
        return
    sectors.sort(key=lambda s: s["cap"], reverse=True)
    io.write_json(f"sectors/{scope}.json", {"asOf": date.today().isoformat(), "sectors": sectors})
    print(f"  sectors/{scope}.json: {len(sectors)} 섹터, {sum(len(s['top']) for s in sectors)} 종목")



def main() -> None:
    # 순서 주의: universe.json 은 build_universe 가 쓴다. 그보다 먼저 돌리면
    # 직전 실행의 낡은 유니버스로 집계된다.
    universe = io.read_json("universe.json", None)
    if not universe:
        # universe.json 이 아직 없으면 부분 결과 합치기
        universe = (io.read_json("universe_kr.json", []) or []) + (io.read_json("universe_us.json", []) or [])
    if not universe:
        print("universe 데이터 없음 — 먼저 수집을 실행하세요.", file=sys.stderr)
        sys.exit(1)

    for scope in ("KR", "US", "ETF"):
        build_scope(scope, universe)


if __name__ == "__main__":
    main()
