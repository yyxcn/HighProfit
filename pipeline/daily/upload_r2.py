"""
R2 업로드 (명세 5-2). data/ 트리를 버킷 루트로 동기화.
- parquet 는 콘텐츠 해시가 바뀐 것만 (휴장일 쓰기 낭비 방지)
- json 은 항상 갱신 (작고 meta 반영 필요)

사용:
  python -m pipeline.daily.upload_r2                 # 전체
  python -m pipeline.daily.upload_r2 --prefix ohlcv/KR
필수 env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
"""
from __future__ import annotations

import argparse
import hashlib
import os
import sys
from pathlib import Path

from pipeline.lib import io


def _md5(path: Path) -> str:
    h = hashlib.md5()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prefix", default="", help="특정 하위 경로만 업로드")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not io.DATA_DIR.exists():
        print("data/ 없음 — 먼저 수집을 실행하세요.", file=sys.stderr)
        sys.exit(1)

    bucket = os.environ.get("R2_BUCKET")
    client = None if args.dry_run else io.r2_client()

    root = io.DATA_DIR / args.prefix if args.prefix else io.DATA_DIR
    files = [p for p in root.rglob("*") if p.is_file() and p.suffix in io.CONTENT_TYPES]

    uploaded, skipped = 0, 0
    for p in files:
        key = str(p.relative_to(io.DATA_DIR)).replace(os.sep, "/")
        ctype = io.CONTENT_TYPES[p.suffix]

        if not args.dry_run:
            # parquet 는 etag(md5) 비교로 미변경 스킵. json 은 항상.
            if p.suffix == ".parquet":
                try:
                    head = client.head_object(Bucket=bucket, Key=key)
                    if head.get("ETag", "").strip('"') == _md5(p):
                        skipped += 1
                        continue
                except Exception:  # noqa: BLE001 (없으면 업로드)
                    pass
            client.upload_file(str(p), bucket, key, ExtraArgs={"ContentType": ctype})
        uploaded += 1

    verb = "업로드 예정" if args.dry_run else "업로드"
    print(f"{verb} {uploaded} 파일, 스킵 {skipped} (대상 {len(files)})")


if __name__ == "__main__":
    main()
