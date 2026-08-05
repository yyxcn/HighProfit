"""공통 IO — 경로, parquet/json 쓰기, R2 업로드, 휴장일 스킵 판정."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

import pandas as pd

# 산출물 루트. 로컬은 repo/data, CI 는 동일. 웹 dev 는 apps/web/public/data 로 복사.
REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.environ.get("HP_DATA_DIR", REPO_ROOT / "data"))

# OHLCV parquet 스키마 (명세 5-3). close 는 반드시 수정주가.
OHLCV_COLUMNS = ["date", "open", "high", "low", "close", "volume"]
OHLCV_DTYPES = {
    "open": "float32",
    "high": "float32",
    "low": "float32",
    "close": "float32",
    "volume": "int64",
}


def ensure(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def write_json(rel: str, obj) -> Path:
    p = ensure(DATA_DIR / rel)
    p.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return p


def read_json(rel: str, default=None):
    p = DATA_DIR / rel
    if not p.exists():
        return default
    return json.loads(p.read_text(encoding="utf-8"))


def write_ohlcv(market: str, ticker: str, df: pd.DataFrame) -> Path:
    """OHLCV DataFrame → parquet. 스키마·정렬 강제."""
    df = df.copy()
    df["date"] = df["date"].astype(str)
    for col, dt in OHLCV_DTYPES.items():
        df[col] = df[col].astype(dt)
    df = df[OHLCV_COLUMNS].sort_values("date").reset_index(drop=True)
    p = ensure(DATA_DIR / "ohlcv" / market / f"{ticker}.parquet")
    # snappy: hyparquet(브라우저 리더)가 기본 지원하는 코덱
    df.to_parquet(p, engine="pyarrow", compression="snappy", index=False)
    return p


def content_hash(df: pd.DataFrame) -> str:
    """휴장일 스킵용 지문. 직전 영업일과 동일하면 업로드 건너뜀 (명세 5-1)."""
    return hashlib.sha1(pd.util.hash_pandas_object(df, index=False).values.tobytes()).hexdigest()


def now_kst_iso() -> str:
    from datetime import datetime, timedelta, timezone

    kst = timezone(timedelta(hours=9))
    return datetime.now(kst).replace(microsecond=0).isoformat()


def update_meta(**fields) -> dict:
    """meta.json 부분 갱신."""
    meta = read_json("meta.json", {}) or {}
    meta.update({k: v for k, v in fields.items() if v is not None})
    write_json("meta.json", meta)
    return meta


# ---- R2 (S3 호환) ----

def r2_client():
    import boto3

    account = os.environ["R2_ACCOUNT_ID"]
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


CONTENT_TYPES = {".json": "application/json", ".parquet": "application/octet-stream"}
