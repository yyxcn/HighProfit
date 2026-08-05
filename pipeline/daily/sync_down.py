"""
R2 → 로컬 다운로드 (교차 워크플로 병합·휴장일 스킵 판정용).
예: US 워크플로가 universe_kr.json 을 받아와 universe.json 을 병합.

  python -m pipeline.daily.sync_down --keys universe_kr.json meta.json
  python -m pipeline.daily.sync_down --prefix ohlcv/US
"""
from __future__ import annotations

import argparse
import os
import sys

from pipeline.lib import io


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--keys", nargs="*", default=[], help="정확한 키 목록")
    ap.add_argument("--prefix", default="", help="프리픽스 전체")
    args = ap.parse_args()

    bucket = os.environ.get("R2_BUCKET")
    if not bucket:
        print("R2_BUCKET 미설정 — 스킵", file=sys.stderr)
        return
    client = io.r2_client()

    keys = list(args.keys)
    if args.prefix:
        token = None
        while True:
            kw = {"Bucket": bucket, "Prefix": args.prefix}
            if token:
                kw["ContinuationToken"] = token
            resp = client.list_objects_v2(**kw)
            keys += [o["Key"] for o in resp.get("Contents", [])]
            if not resp.get("IsTruncated"):
                break
            token = resp.get("NextContinuationToken")

    got = 0
    for key in keys:
        dest = io.DATA_DIR / key
        io.ensure(dest)
        try:
            client.download_file(bucket, key, str(dest))
            got += 1
        except Exception as e:  # noqa: BLE001
            print(f"  ! {key} 없음/실패: {e}", file=sys.stderr)
    print(f"다운로드 {got}/{len(keys)}")


if __name__ == "__main__":
    main()
