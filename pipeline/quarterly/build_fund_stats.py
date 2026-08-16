"""
펀드 성과 + 인기 주식 사전집계 (Overview / 인기 주식 탭).

입력  .cache/13f/*.json (분기별 홀딩, fetch_13f 가 적재)
      config/cusip_map.csv (map_cusips 가 채움)
      DATA_DIR/ohlcv/US/*.parquet (수정주가)
출력  DATA_DIR/funds/performance.json  — 펀드별 1Y/3Y/5Y/설정후 성과 + 월말 곡선
      DATA_DIR/funds/popular.json      — 분기별 인기 보유/신규 매수/청산 Top N

성과 산출 방식 (13F 한계를 그대로 반영):
- 각 분기 홀딩을 **공시일(filedAt) 다음 거래일**부터 다음 공시일까지 보유했다고 가정한다.
  분기말(reportDate) 기준으로 잡으면 45일 뒤에나 알 수 있는 정보를 미리 쓴 셈(후행편향)이 된다.
- 티커가 매핑되고 가격이 있는 종목만 쓰고 비중은 그 안에서 재정규화한다 → 커버리지를 신뢰도로 노출.
- 롱온리·주식만. 공매도·옵션·채권·현금은 13F 에 없으므로 실제 펀드 수익률과 다르다.

  python -m pipeline.quarterly.build_fund_stats
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

from pipeline.lib import io

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
CONFIG = PIPELINE_ROOT / "config"
CACHE13F = PIPELINE_ROOT / ".cache" / "13f"

TOP_N = 30           # 인기 주식 목록 길이
POPULAR_QUARTERS = 12  # 인기 주식 탭에서 고를 수 있는 분기 수
BROAD_POSITIONS = 500  # 이 이상 종목을 들면 '인덱스성'으로 보고 기본 집계에서 제외
MIN_COVERAGE = 0.5   # 티커 매핑이 이보다 적으면 성과가 표본이 아니라 잡음이다 → 랭킹에서 제외
# 마지막 공시 이후 이 기간까지만 보유했다고 본다. 청산·폐업한 펀드의 포트폴리오를
# 영원히 굴려 랭킹 상단에 남기지 않기 위한 컷오프(한 분기 + 45일 공시지연).
STALE_DAYS = 135
# 곡선 끝이 최신일에서 이만큼 안쪽이면 '현재 운용 중'으로 본다(공시 시점 편차 흡수).
GRACE_DAYS = 60


# ---------- 입력 로드 ----------

def load_cusip_map() -> dict[str, str]:
    p = CONFIG / "cusip_map.csv"
    if not p.exists():
        return {}
    with p.open(encoding="utf-8") as f:
        return {r["cusip"].strip(): r["ticker"].strip() for r in csv.DictReader(f) if r.get("ticker")}


# EDGAR conformed name 은 법인 정식명이라 표에 그대로 쓰면 길고 시끄럽다.
# ("SANDS CAPITAL MANAGEMENT, LLC" → "Sands Capital Management")
LEGAL_SUFFIX = re.compile(
    r"[\s,]*(?:"
    r"L\.?\s*L\.?\s*C\.?|L\.?\s*P\.?|LLP|INC\.?|CORP\.?|CORPORATION|CO\.?|LTD\.?|PLC|"
    r"ET\s+AL|GP|TRUST|/[A-Z]{2}/?|\([^)]*\)"
    r")\.?$",
    re.I,
)
# 대문자를 유지할 약어. 길이 규칙으로 자동 판정하면 SANDS·BANK·COX 까지 대문자로 남는다.
ACRONYMS = {
    "AQR", "GAMCO", "SRS", "HHLR", "ARK", "JANA", "PDT", "QIM", "HG", "RA", "D1",
    "SPDR", "GSA", "AG", "US", "UK", "II", "III",
}


def pretty_name(name: str) -> str:
    """EDGAR 정식명 → 표시용. 법인 접미사를 떼고 전부 대문자면 제목 표기로."""
    s = name.strip()
    for _ in range(3):  # "…, L.P. ET AL" 처럼 접미사가 겹친 경우
        new = LEGAL_SUFFIX.sub("", s).strip(" ,")
        if new == s or not new:
            break
        s = new
    if s.isupper():
        s = " ".join(w if w in ACRONYMS else w.title() for w in s.split())
    return s or name


def load_index() -> list[dict]:
    idx = io.read_json("funds/index.json", {"funds": []})
    return idx.get("funds", [])


def load_quarters(cik: str) -> list[dict]:
    """해당 펀드의 분기 홀딩(오래된 → 최신)."""
    out = []
    for p in sorted(CACHE13F.glob(f"{cik}_*.json")):
        try:
            # 캐시는 SEC 원본이라 천 달러 단위로 신고된 분기가 섞여 있다 → 읽을 때 달러로 맞춘다
            out.append(io.normalize_13f_units(json.loads(p.read_text(encoding="utf-8"))))
        except json.JSONDecodeError:
            continue
    out.sort(key=lambda q: q["quarter"])
    return out


# ---------- 가격 ----------

def load_prices(tickers: set[str], since: str) -> pd.DataFrame:
    """필요한 티커의 수정종가만 모아 (날짜 × 티커) 피벗. 없는 티커는 조용히 스킵."""
    base = io.DATA_DIR / "ohlcv" / "US"
    cols: dict[str, pd.Series] = {}
    missing = 0
    for t in sorted(tickers):
        f = base / f"{t}.parquet"
        if not f.exists():
            missing += 1
            continue
        try:
            df = pd.read_parquet(f, columns=["date", "close"])
        except Exception:  # noqa: BLE001 — 깨진 파일 하나가 전체를 막지 않게
            missing += 1
            continue
        df = df[df["date"] >= since]
        if df.empty:
            missing += 1
            continue
        cols[t] = pd.Series(df["close"].to_numpy(dtype="float64"), index=df["date"].to_numpy())
    print(f"  가격 로드: {len(cols)} 티커 (미보유 {missing})")
    if not cols:
        return pd.DataFrame()
    px = pd.DataFrame(cols).sort_index()
    return px.ffill()


# ---------- 성과 ----------

def next_trading_day(dates: np.ndarray, day: str) -> str | None:
    """day 이후(포함) 첫 거래일."""
    i = int(np.searchsorted(dates, day, side="left"))
    return str(dates[i]) if i < len(dates) else None


def build_curve(quarters: list[dict], cmap: dict[str, str], px: pd.DataFrame) -> tuple[pd.Series, float]:
    """
    분기 홀딩을 공시일 기준으로 이어붙인 일별 포트폴리오 지수(시작=1.0)와 가치 커버리지.
    """
    if px.empty:
        return pd.Series(dtype="float64"), 0.0
    dates = px.index.to_numpy()
    segments: list[tuple[str, str | None, dict[str, float]]] = []
    cov_num = cov_den = 0.0

    for i, q in enumerate(quarters):
        start = next_trading_day(dates, q["filedAt"])
        if start is None:
            continue
        if i + 1 < len(quarters):
            end = next_trading_day(dates, quarters[i + 1]["filedAt"])
        else:
            # 마지막 분기: 다음 공시가 없으면 STALE_DAYS 까지만 굴린다(폐업 펀드 방지).
            cutoff = (date.fromisoformat(q["filedAt"]) + timedelta(days=STALE_DAYS)).isoformat()
            end = next_trading_day(dates, cutoff)

        weights: dict[str, float] = {}
        total = 0.0
        for h in q["holdings"]:
            v = float(h["value"])
            if v <= 0:
                continue
            total += v
            t = cmap.get(h["cusip"])
            if t and t in px.columns:
                weights[t] = weights.get(t, 0.0) + v
        used = sum(weights.values())
        cov_num += used
        cov_den += total
        if used <= 0:
            continue
        weights = {t: v / used for t, v in weights.items()}
        segments.append((start, end, weights))

    if not segments:
        return pd.Series(dtype="float64"), 0.0

    curve = pd.Series(dtype="float64")
    level = 1.0
    for start, end, weights in segments:
        window = px.loc[start:] if end is None else px.loc[start:end]
        if len(window) < 2:
            continue
        sub = window[list(weights)]
        base = sub.iloc[0]
        valid = base.notna() & (base > 0)
        if not valid.any():
            continue
        sub = sub.loc[:, valid.to_numpy()]
        w = np.array([weights[t] for t in sub.columns], dtype="float64")
        w = w / w.sum()
        rel = sub.div(sub.iloc[0], axis=1).ffill().fillna(1.0)
        seg = pd.Series(rel.to_numpy() @ w, index=sub.index) * level
        # 구간 경계는 다음 구간 시작일과 겹치므로 마지막 점은 다음 구간이 이어받는다
        curve = pd.concat([curve[~curve.index.isin(seg.index)], seg])
        level = float(seg.iloc[-1])

    curve = curve.sort_index()
    return curve, (cov_num / cov_den if cov_den else 0.0)


def window_return(curve: pd.Series, days: int, as_of: str) -> float | None:
    """
    곡선 끝에서 거슬러 days 일 수익률.
    단, 곡선 끝이 전체 최신일(as_of)에서 GRACE_DAYS 넘게 뒤처졌으면 None —
    공시를 멈춘 펀드의 몇 해 전 구간을 '최근 1년'이라 부르지 않기 위해서다.
    이력이 구간을 다 덮지 못해도 None.
    """
    if len(curve) < 2:
        return None
    end_day = str(curve.index[-1])
    if (date.fromisoformat(as_of) - date.fromisoformat(end_day)).days > GRACE_DAYS:
        return None  # 공시가 끊긴 펀드 — 옛 구간을 '최근 N년'이라 부르지 않는다
    target = (date.fromisoformat(end_day) - timedelta(days=days)).isoformat()
    if str(curve.index[0]) > target:
        return None
    i = int(np.searchsorted(curve.index.to_numpy(), target, side="left"))
    i = min(i, len(curve) - 1)
    start = float(curve.iloc[i])
    if start <= 0:
        return None
    return float(curve.iloc[-1]) / start - 1.0


def annualize(total_ret: float | None, days: int) -> float | None:
    if total_ret is None or days <= 0:
        return None
    return (1.0 + total_ret) ** (365.0 / days) - 1.0


def monthly_curve(curve: pd.Series) -> list[list]:
    """월말 샘플 [[date, value], …] — 상세 탭 성과 차트용(파일 크기 절약)."""
    if curve.empty:
        return []
    s = curve.copy()
    ym = pd.Index([str(d)[:7] for d in s.index])
    last = ~ym.duplicated(keep="last")
    sampled = s[last]
    return [[str(d), round(float(v), 4)] for d, v in sampled.items()]


def reliability(coverage: float, quarters: int) -> str:
    """커버리지(가치 기준 매핑률)와 이력 길이로 매긴 추정 신뢰도."""
    if quarters < 4 or coverage < 0.6:
        return "low"
    if coverage < 0.85:
        return "mid"
    return "high"


# ---------- 인기 주식 ----------

def quarter_changes(cur: dict, prev: dict | None) -> dict[str, str]:
    """cusip → new|add|reduce|hold|exit."""
    cur_sh = {h["cusip"]: h["shares"] for h in cur["holdings"]}
    if prev is None:
        return {c: "hold" for c in cur_sh}
    prev_sh = {h["cusip"]: h["shares"] for h in prev["holdings"]}
    out: dict[str, str] = {}
    for c, sh in cur_sh.items():
        p = prev_sh.get(c)
        if p is None:
            out[c] = "new"
        elif sh > p * 1.0001:
            out[c] = "add"
        elif sh < p * 0.9999:
            out[c] = "reduce"
        else:
            out[c] = "hold"
    for c, sh in prev_sh.items():
        if c not in cur_sh and sh > 0:
            out[c] = "exit"
    return out


def build_popular(
    per_fund: dict[str, list[dict]], meta: dict[str, dict], cmap: dict[str, str]
) -> dict:
    """분기별 인기 보유 / 신규 매수 / 청산 Top N (전체 · 인덱스성 제외 두 벌)."""
    all_quarters = sorted({q["quarter"] for qs in per_fund.values() for q in qs})
    quarters = all_quarters[-POPULAR_QUARTERS:]
    out = []

    for quarter in quarters:
        # cusip → 집계
        agg: dict[str, dict] = {}
        filed = 0
        for cik, qs in per_fund.items():
            by_q = {q["quarter"]: q for q in qs}
            cur = by_q.get(quarter)
            if cur is None:
                continue
            filed += 1
            i = [q["quarter"] for q in qs].index(quarter)
            prev = qs[i - 1] if i > 0 else None
            changes = quarter_changes(cur, prev)
            broad = len(cur["holdings"]) >= BROAD_POSITIONS
            values = {h["cusip"]: float(h["value"]) for h in cur["holdings"]}
            names = {h["cusip"]: h["name"] for h in cur["holdings"]}
            if prev:
                for h in prev["holdings"]:
                    names.setdefault(h["cusip"], h["name"])

            # 청산 종목은 이번 분기 평가액이 0 이다 — 규모를 보려면 직전 분기 값을 써야 한다
            prev_values = {h["cusip"]: float(h["value"]) for h in (prev["holdings"] if prev else [])}

            for cusip, ch in changes.items():
                a = agg.setdefault(
                    cusip,
                    {"name": names.get(cusip, cusip), "hold": [], "new": [], "exit": []},
                )
                label = meta.get(cik, {}).get("label", cik)
                if ch == "exit":
                    a["exit"].append({"label": label, "value": prev_values.get(cusip, 0.0), "broad": broad})
                    continue
                rec = {"label": label, "value": values.get(cusip, 0.0), "broad": broad}
                a["hold"].append(rec)
                if ch == "new":
                    a["new"].append(rec)

        def rank(key: str, include_broad: bool) -> list[dict]:
            rows = []
            for cusip, a in agg.items():
                recs = [r for r in a[key] if include_broad or not r["broad"]]
                if not recs:
                    continue
                recs.sort(key=lambda r: -r["value"])
                rows.append(
                    {
                        "cusip": cusip,
                        "ticker": cmap.get(cusip),
                        "name": a["name"],
                        "managers": len(recs),
                        "value": round(sum(r["value"] for r in recs)),
                        "top": [r["label"] for r in recs[:3]],
                    }
                )
            rows.sort(key=lambda r: (-r["managers"], -r["value"]))
            return rows[:TOP_N]

        entry = {"quarter": quarter, "filed": filed, "total": len(per_fund)}
        for scope, include in (("all", True), ("focused", False)):
            entry[scope] = {
                "hold": rank("hold", include),
                "new": rank("new", include),
                "exit": rank("exit", include),
            }
        out.append(entry)

    return {"asOf": date.today().isoformat(), "topN": TOP_N, "broadThreshold": BROAD_POSITIONS, "quarters": out}


# ---------- main ----------

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", type=int, default=10, help="성과 계산에 쓸 최대 연수")
    args = ap.parse_args()

    funds = load_index()
    if not funds:
        print("funds/index.json 이 없다 — fetch_13f 를 먼저 실행", file=sys.stderr)
        sys.exit(1)

    cmap = load_cusip_map()
    since = (date.today() - timedelta(days=365 * args.years + 120)).isoformat()

    per_fund: dict[str, list[dict]] = {}
    meta: dict[str, dict] = {}
    for f in funds:
        qs = [q for q in load_quarters(f["cik"]) if q["filedAt"] >= since]
        if qs:
            per_fund[f["cik"]] = qs
        meta[f["cik"]] = {"label": f.get("manager") or pretty_name(f["name"]), "name": f["name"]}

    # 필요한 티커만 모아 한 번에 로드
    need: set[str] = set()
    for qs in per_fund.values():
        for q in qs:
            for h in q["holdings"]:
                t = cmap.get(h["cusip"])
                if t:
                    need.add(t)
    print(f"펀드 {len(per_fund)} · 분기 {sum(len(v) for v in per_fund.values())} · 티커 {len(need)}")
    px = load_prices(need, since)

    if px.empty:
        print("가격 데이터가 없다 — map_cusips / daily.fetch_us 를 먼저 실행", file=sys.stderr)
        sys.exit(1)
    as_of = str(px.index[-1])

    perf = []
    for f in funds:
        qs = per_fund.get(f["cik"])
        if not qs:
            continue
        curve, coverage = build_curve(qs, cmap, px)
        if len(curve) < 2:
            print(f"  ~ {f['name']}: 곡선 생성 실패(가격/매핑 부족)", file=sys.stderr)
            continue
        if coverage < MIN_COVERAGE:
            # 절반도 못 맞춘 포트폴리오의 수익률은 그 펀드의 성과가 아니다 — 랭킹에서 뺀다.
            print(f"  ~ {f['name']}: 커버리지 {coverage:.0%} < {MIN_COVERAGE:.0%} → 제외", file=sys.stderr)
            continue
        first, last = str(curve.index[0]), str(curve.index[-1])
        active = (date.fromisoformat(as_of) - date.fromisoformat(last)).days <= GRACE_DAYS
        if not active:
            # 공시가 끊긴 펀드는 랭킹에 올리지 않는다. 지금 따라 할 수 있는 포트폴리오가 아니다.
            print(f"  ~ {f['name']}: {qs[-1]['quarter']} 이후 공시 없음 → 제외", file=sys.stderr)
            continue
        span = (date.fromisoformat(last) - date.fromisoformat(first)).days
        total = float(curve.iloc[-1]) - 1.0
        r1, r3, r5 = (window_return(curve, d, as_of) for d in (365, 365 * 3, 365 * 5))
        perf.append(
            {
                "cik": f["cik"],
                "name": pretty_name(f["name"]),
                "manager": f.get("manager") or "",
                "category": f.get("category") or "",
                "inception": qs[0]["quarter"],
                "inceptionDate": first,
                "latest": qs[-1]["quarter"],
                "filedAt": qs[-1]["filedAt"],  # 그 분기를 SEC 에 실제로 낸 날 (분기말이 아니다)
                "active": active,
                "quarters": len(qs),
                "aum": f.get("aum", 0),
                "positions": f.get("positions", 0),
                "ret1y": r1,
                "cagr3y": annualize(r3, 365 * 3),
                "cagr5y": annualize(r5, 365 * 5),
                "cagrInception": annualize(total, span),
                "totalReturn": total,
                "coverage": round(coverage, 4),
                "reliability": reliability(coverage, len(qs)),
                "curve": monthly_curve(curve),
            }
        )

    perf.sort(key=lambda p: (p["cagrInception"] is None, -(p["cagrInception"] or 0)))
    io.write_json("funds/performance.json", {"asOf": as_of, "funds": perf})
    print(f"  ✓ performance.json — {len(perf)} 펀드")

    popular = build_popular(per_fund, meta, cmap)
    io.write_json("funds/popular.json", popular)
    print(f"  ✓ popular.json — {len(popular['quarters'])} 분기")


if __name__ == "__main__":
    main()
