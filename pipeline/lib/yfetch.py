"""
yfinance OHLCV 수집 공통 로직 — KR/US 가 공유한다.

- 60종목씩 묶어 한 요청으로 받는다(청크). 단건 반복보다 5~6배 빠르고 요청 수도 1/60 이라
  야후 throttle 을 덜 건드린다.
- 청크는 60개 중 하나가 이상하면 통째로 누락될 수 있어, 빠진 종목만 단건으로 재시도한다.
- 대상 목록·시총·섹터는 여기서 건드리지 않는다(수집기는 시세만 쓴다).
  목록은 dev/build_full_universe.py, 시총·섹터는 dev/enrich_meta.py 담당.
"""
from __future__ import annotations

import sys
import time
from typing import Callable

import pandas as pd

from pipeline.lib import io

# 겹치는 구간 종가가 이 비율 이상 어긋나면 액면분할/배당 재조정으로 본다.
# float32 로 저장하므로 정확히 같길 기대할 수 없어 여유를 둔다.
ADJUST_RTOL = 1e-3


def normalize(df: pd.DataFrame | None, min_rows: int) -> pd.DataFrame | None:
    """yfinance 프레임 → 표준 OHLCV. 비었거나 너무 짧으면 None."""
    if df is None or df.empty:
        return None
    df = df.dropna(how="all")
    if df.empty:
        return None
    df = df.rename(columns=str.lower).reset_index()
    date_col = "Date" if "Date" in df.columns else df.columns[0]
    df["date"] = pd.to_datetime(df[date_col]).dt.strftime("%Y-%m-%d")
    if "close" not in df.columns:
        return None
    df = df[df["close"] > 0]
    # 상장 직후 종목은 계절성·백테스트에 못 쓴다. 차트만 볼 거면 min_rows 를 낮춘다.
    return df[io.OHLCV_COLUMNS] if len(df) >= min_rows else None


def fetch_chunk(yf, symbols: list[str], min_rows: int, period: str = "max") -> dict[str, pd.DataFrame]:
    """여러 종목을 한 요청으로. 반환에 없는 심볼은 실패로 본다. 키는 yfinance 심볼."""
    try:
        data = yf.download(
            symbols, period=period, auto_adjust=True,
            group_by="ticker", threads=True, progress=False,
        )
    except Exception as e:  # noqa: BLE001
        print(f"  ! 청크 실패({len(symbols)}종목): {e}", file=sys.stderr)
        return {}
    if data is None or data.empty:
        return {}

    out: dict[str, pd.DataFrame] = {}
    multi = isinstance(data.columns, pd.MultiIndex)
    for s in symbols:
        try:
            raw = data[s] if multi else data
        except KeyError:
            continue
        df = normalize(raw, min_rows)
        if df is not None:
            out[s] = df
    return out


def fetch_one(yf, symbol: str, min_rows: int, period: str = "max") -> pd.DataFrame | None:
    """단건 재시도용. 청크에서 누락된 종목만 여기로 온다."""
    try:
        raw = yf.download(
            symbol, period=period, auto_adjust=True, progress=False, threads=False
        )
    except Exception as e:  # noqa: BLE001
        print(f"  ! {symbol} 실패: {e}", file=sys.stderr)
        return None
    if raw is not None and isinstance(raw.columns, pd.MultiIndex):
        raw.columns = raw.columns.get_level_values(0)
    return normalize(raw, min_rows)


def path_of(market: str, ticker: str):
    return io.DATA_DIR / "ohlcv" / market / f"{ticker}.parquet"


def save(market: str, ticker: str, df: pd.DataFrame, force: bool = False) -> bool:
    """휴장일이면(최신 봉이 기존과 동일) 재작성하지 않는다. 새로 썼으면 True.

    날짜만 비교하면 액면분할처럼 **날짜는 같고 가격만 재조정된** 경우를 놓친다.
    종가까지 같아야 스킵한다.

    `force` 는 이 스킵을 끈다. 소스를 갈아탈 때 필요하다 — 같은 종목이라도 제공자가 다르면
    마지막 봉의 날짜·종가는 같은데 과거 구간 길이가 통째로 다를 수 있어, 스킵되면 안 된다.
    """
    existing = path_of(market, ticker)
    if existing.exists() and not force:
        old = pd.read_parquet(existing)
        if not old.empty and old["date"].iloc[-1] == df["date"].iloc[-1]:
            a, b = float(old["close"].iloc[-1]), float(df["close"].iloc[-1])
            if abs(a - b) <= ADJUST_RTOL * abs(b):
                return False
    io.write_ohlcv(market, ticker, df)
    return True


def merge(old: pd.DataFrame, new: pd.DataFrame) -> pd.DataFrame | None:
    """증분 프레임을 기존 이력에 붙인다. 과거가 재조정됐으면 None(→ 전량 재수집).

    `auto_adjust=True` 라 액면분할이 나면 야후가 **과거 전체 가격을 다시 계산**한다.
    그걸 모르고 뒤에만 붙이면 분할 이전 구간이 옛 가격으로 남아 계절성·백테스트가 오염된다.
    그래서 겹치는 날짜의 종가를 비교해 어긋나면 그 종목만 전체를 다시 받게 한다.
    """
    overlap = old.merge(new, on="date", suffixes=("_o", "_n"))
    if overlap.empty:
        return None  # 겹치는 구간이 없다 = 공백이 너무 크다 → 전량 재수집
    o, n = overlap["close_o"].to_numpy(float), overlap["close_n"].to_numpy(float)
    if not bool((abs(o - n) <= ADJUST_RTOL * abs(n)).all()):
        return None  # 과거가 재조정됨 → 전량 재수집

    fresh = new[~new["date"].isin(old["date"])]
    if fresh.empty:
        return old
    return pd.concat([old, fresh], ignore_index=True).sort_values("date").reset_index(drop=True)


def _download(yf, symbols: list[str], chunk: int, sleep: float, min_rows: int,
              period: str, label: str) -> dict[str, pd.DataFrame]:
    """청크로 받고, 누락된 심볼만 단건 재시도해서 모은다."""
    frames: dict[str, pd.DataFrame] = {}
    missing: list[str] = []
    t0 = time.time()

    for i in range(0, len(symbols), chunk):
        part = symbols[i : i + chunk]
        if chunk > 1:
            got = fetch_chunk(yf, part, min_rows, period)
        else:
            df = fetch_one(yf, part[0], min_rows, period)
            got = {part[0]: df} if df is not None else {}
        frames.update(got)
        missing.extend(s for s in part if s not in got)

        done = min(i + chunk, len(symbols))
        if done % (chunk * 10) == 0 or done == len(symbols):
            el = time.time() - t0
            eta = el / done * (len(symbols) - done) / 60
            print(f"  [{label}] {done}/{len(symbols)} (수신 {len(frames)}) — 남은 예상 {eta:.0f}분",
                  flush=True)
        time.sleep(sleep)

    if missing and chunk > 1:
        print(f"  [{label}] 단건 재시도: {len(missing)}종목", flush=True)
        for s in missing:
            df = fetch_one(yf, s, min_rows, period)
            if df is not None:
                frames[s] = df
            time.sleep(0.2)
    return frames


def collect(
    market: str,
    tickers: list[str],
    to_symbol: Callable[[str], str],
    *,
    chunk: int = 60,
    sleep: float = 0.4,
    min_rows: int = 20,
    full: bool = False,
    window: str = "3mo",
) -> None:
    """티커 목록을 받아 parquet 까지 쓰고 meta 를 갱신한다.

    **이미 받아둔 구간은 다시 받지 않는다(증분).** parquet 이 있는 종목은 최근 `window` 만
    받아 뒤에 붙인다 — 전체 이력을 매번 재다운로드하면 US 전종목 기준 4시간이 걸린다.
    parquet 이 없거나 과거가 재조정된 종목만 `period="max"` 로 전량 받는다.
    `full=True` 면 전부 전량 재수집(월 1회 정합성 점검용).

    `to_symbol` 은 저장 티커 → yfinance 심볼 변환(KR 은 `005930` → `005930.KS`).
    저장은 항상 원래 티커 기준이라 웹앱 URL(`?m=KR&t=005930`)과 어긋나지 않는다.
    """
    import yfinance as yf

    if not tickers:
        print("대상 없음 — 종료")
        return

    back = {to_symbol(t): t for t in tickers}
    chunk = max(1, chunk)
    t0 = time.time()

    if full:
        new_syms, inc_syms = list(back), []
    else:
        new_syms = [s for s, t in back.items() if not path_of(market, t).exists()]
        inc_syms = [s for s, t in back.items() if path_of(market, t).exists()]
    print(f"  신규(전량) {len(new_syms)} / 증분 {len(inc_syms)}", flush=True)

    results: dict[str, pd.DataFrame] = {}
    refetch: list[str] = []

    # ① 증분 — 최근 구간만 받아 기존 이력에 붙인다
    if inc_syms:
        for s, df in _download(yf, inc_syms, chunk, sleep, 1, window, "증분").items():
            old = pd.read_parquet(path_of(market, back[s]))
            merged = merge(old, df)
            if merged is None:
                refetch.append(s)  # 분할·재조정 감지 → 전량 재수집 대상
            else:
                results[s] = merged
        if refetch:
            print(f"  과거 재조정 감지 {len(refetch)}종목 → 전량 재수집", flush=True)

    # ② 신규 + 재조정분 — 전체 이력
    todo = new_syms + refetch
    if todo:
        results.update(_download(yf, todo, chunk, sleep, min_rows, "max", "전량"))

    ok, skipped = 0, 0
    for s, df in results.items():
        # --full 은 "소스를 갈아탄다"는 뜻이라 스킵 검사를 끈다(위 save() 주석 참고).
        if save(market, back[s], df, force=full):
            ok += 1
        else:
            skipped += 1

    io.update_meta(**{f"lastUpdated{market}": io.now_kst_iso()})
    failed = len(back) - len(results)
    print(
        f"완료: {market} OHLCV {ok} 작성, {skipped} 스킵, {failed} 미수집"
        f"(상장직후·거래중지 포함) — {(time.time() - t0) / 60:.1f}분"
    )
