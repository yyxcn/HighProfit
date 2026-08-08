"""
universe 의 시총·섹터 보강 — yfinance `Ticker.info`. KR/US 공용.

전종목 인덱스(dev/build_full_universe.py)는 시총 0 / 섹터 "기타" 로 채워져 나온다.
그 상태면 build_sectors 가 cap<=0 을 제외하고(히트맵에서 사라짐), 검색도 시총 내림차순
정렬이라 항상 최하단으로 밀린다. 즉 수집해두고 화면 어디에도 안 나오는 상태가 된다.

- 주식: marketCap + sector(GICS 명칭으로 매핑) → **KR/US 가 같은 11개 섹터 축을 공유한다**
- ETF : totalAssets(AUM) + category. 단 **KR ETF 는 야후가 순자산을 주지 않아 비게 된다**
- 시총은 억 KRW 로 통일 (io.usd_to_eok / KR 은 원화라 1e8 로만 나눔)

**전종목을 채우지 않는다(기본 --top 2000).** 실제 소비처가 두 곳뿐이라 그렇다:
  · 히트맵 — `build_sectors` 가 섹터당 상위 50개만 쓰고, 섹터 색은 시총가중이라 대형주가 결정
  · 검색 정렬 — 시총 내림차순. 없어도 검색은 되고 순서만 뒤로 밀린다
반면 `Ticker.info` 는 종목당 1요청이라 청크가 불가능하고, 수천 건을 연속으로 던지면 야후가
응답을 지연시킨다(실측: 소량 0.35초/종목 → 1만 건 구간에서 7초/종목). 병렬화는 throttle 을
키우므로 쓰지 않는다.

  python -m pipeline.dev.enrich_meta                    # US(기본), 상위 2000 중 시총 빈 것
  python -m pipeline.dev.enrich_meta --market KR
  python -m pipeline.dev.enrich_meta --market all --all # 양쪽 전부 재조회
  python -m pipeline.dev.enrich_meta --top 0 --all      # 전종목 강제(수 시간~하루)
"""
from __future__ import annotations

import argparse
import sys
import time

from pipeline.lib import io

# yfinance 의 sector 는 자체 분류라 GICS 표준 명칭과 다르다. KR/US 히트맵이 같은 축에
# 놓이려면 통일해야 한다 (안 하면 "Technology" 와 "Information Technology" 가 별개 섹터).
GICS = {
    "Technology": "Information Technology",
    "Financial Services": "Financials",
    "Healthcare": "Health Care",
    "Consumer Cyclical": "Consumer Discretionary",
    "Consumer Defensive": "Consumer Staples",
    "Basic Materials": "Materials",
    # 아래는 명칭이 이미 일치
    "Communication Services": "Communication Services",
    "Industrials": "Industrials",
    "Energy": "Energy",
    "Real Estate": "Real Estate",
    "Utilities": "Utilities",
}

# yfinance 심볼 접미사 (KR 만 필요). fetch_kr.SUFFIX 와 같은 규칙.
SUFFIX = {"KOSPI": ".KS", "KOSDAQ": ".KQ", "KONEX": ".KQ"}


def to_symbol(market: str, ticker: str, exchange: str) -> str:
    if market == "US":
        return ticker
    return ticker + SUFFIX.get(exchange, ".KS")


def to_eok(market: str, value) -> int:
    """시총/순자산 → 억 KRW. US 는 달러라 환산, KR 은 이미 원화."""
    if not value:
        return 0
    return io.usd_to_eok(value) if market == "US" else round(float(value) / 1e8)


def fetch_meta(yf, market: str, symbol: str) -> tuple[int, str | None] | None:
    """(시총_억KRW, 섹터). 조회 실패 시 None."""
    try:
        info = yf.Ticker(symbol).info
    except Exception as e:  # noqa: BLE001
        print(f"  ! {symbol}: {type(e).__name__}", file=sys.stderr)
        return None
    if not info:
        return None

    if info.get("quoteType") == "ETF":
        # ETF 는 시총 개념이 없다 — 순자산(AUM)을 규모 지표로 쓴다.
        # KR ETF 는 야후가 이 값을 주지 않아 0 으로 남는다(=ETF 히트맵에서 제외).
        cap = to_eok(market, info.get("totalAssets") or info.get("netAssets"))
        sector = info.get("category")
    else:
        cap = to_eok(market, info.get("marketCap"))
        raw = info.get("sector")
        sector = GICS.get(raw, raw)
    return cap, sector


def turnover_rank(market: str, tickers: list[str], window: int = 20) -> dict[str, float]:
    """최근 `window` 거래일 평균 거래대금(close*volume). 우선순위 정렬용.

    시총이 없는 종목은 정렬 기준이 없어 처리 순서가 임의가 된다. 그러면 중간에 멈췄을 때
    아무도 안 찾는 종목만 채워질 수 있으므로, 이미 받아둔 OHLCV 로 실제 거래 규모를 재서
    붐비는 종목부터 처리한다.
    """
    import pandas as pd

    out: dict[str, float] = {}
    base = io.DATA_DIR / "ohlcv" / market
    for t in tickers:
        p = base / f"{t}.parquet"
        if not p.exists():
            continue
        try:
            df = pd.read_parquet(p, columns=["close", "volume"])
        except Exception:  # noqa: BLE001
            continue
        if df.empty:
            continue
        tail = df.tail(window)
        out[t] = float((tail["close"] * tail["volume"]).mean())
    return out


def enrich(yf, market: str, args) -> None:
    rel = f"universe_{market.lower()}.json"
    universe = io.read_json(rel, []) or []
    if not universe:
        print(f"{rel} 이 없습니다 — dev.build_full_universe 를 먼저 실행하세요.", file=sys.stderr)
        return

    # ① 거래대금 상위 N 으로 범위를 좁힌다 (전종목은 throttle 때문에 하루 단위로 걸린다)
    pool = universe
    if args.top:
        print(f"[{market}] 거래대금 계산 중… ({len(universe)} 종목)", flush=True)
        rank = turnover_rank(market, [u["t"] for u in universe])
        pool = sorted(universe, key=lambda u: rank.get(u["t"], 0.0), reverse=True)[: args.top]

    # ② 그중 시총이 비어 있는 것만 (--all 이면 전부 다시)
    targets = pool if args.all else [u for u in pool if not u.get("c")]
    if args.limit:
        targets = targets[: args.limit]
    print(f"[{market}] 대상 {len(targets)} / 후보 {len(pool)} / 전체 {len(universe)}", flush=True)
    if not targets:
        print(f"[{market}] 채울 종목 없음")
        return

    filled_cap, filled_sec, failed = 0, 0, 0
    t0 = time.time()

    for i, u in enumerate(targets, 1):
        got = fetch_meta(yf, market, to_symbol(market, u["t"], u.get("e", "")))
        if got is None:
            failed += 1
        else:
            cap, sector = got
            if cap:
                u["c"] = cap
                filled_cap += 1
            # 평소엔 빈 값만 채운다. `--all` 은 "전부 다시"라는 뜻이므로 섹터도 덮어쓴다 —
            # KR 은 build_full_universe 가 KIND 표준산업분류(159개 세분류)를 넣어두는데,
            # 그대로면 히트맵이 잘게 쪼개지고 US(GICS 11개)와 축이 달라진다.
            if sector and (args.all or u.get("s") in (None, "", "기타")):
                u["s"] = sector
                filled_sec += 1

        if i % args.flush == 0:
            io.write_json(rel, universe)
            el = time.time() - t0
            eta = el / i * (len(targets) - i) / 60
            print(f"  {i}/{len(targets)} (시총 {filled_cap}, 섹터 {filled_sec}, 실패 {failed}) "
                  f"— 남은 예상 {eta:.0f}분", flush=True)
        time.sleep(args.sleep)

    universe.sort(key=lambda r: r.get("c", 0), reverse=True)
    io.write_json(rel, universe)
    print(f"[{market}] 완료: 시총 {filled_cap} 채움, 섹터 {filled_sec} 채움, {failed} 실패 "
          f"({(time.time() - t0) / 60:.1f}분)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--market", default="US", choices=["US", "KR", "all"])
    ap.add_argument("--all", action="store_true", help="시총이 이미 있어도 다시 조회")
    ap.add_argument("--top", type=int, default=2000,
                    help="거래대금 상위 N 종목만 대상 (0=제한 없음)")
    ap.add_argument("--limit", type=int, default=0, help="대상 중 앞에서 N개만 (테스트용)")
    ap.add_argument("--sleep", type=float, default=0.05, help="요청 간 지연(초)")
    ap.add_argument("--flush", type=int, default=200, help="N종목마다 중간 저장")
    args = ap.parse_args()

    import yfinance as yf

    for m in (["US", "KR"] if args.market == "all" else [args.market]):
        enrich(yf, m, args)
    print("→ build_universe / build_sectors 를 다시 실행해야 화면에 반영됩니다.")


if __name__ == "__main__":
    main()
