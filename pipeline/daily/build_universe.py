"""
검색 인덱스 universe.json 조립 (명세 5-4).
KR(+US) 부분 결과를 합쳐 하나의 배열로. 시총 내림차순.

사용: python -m pipeline.daily.build_universe
"""
from __future__ import annotations

from pipeline.lib import io


def main() -> None:
    rows: list[dict] = []
    kr = io.read_json("universe_kr.json", [])
    us = io.read_json("universe_us.json", [])
    rows.extend(kr or [])
    rows.extend(us or [])

    # 시총 내림차순 (검색 결과 기본 정렬)
    rows.sort(key=lambda r: r.get("c", 0), reverse=True)

    io.write_json("universe.json", rows)
    n_kr = len(kr or [])
    n_us = len(us or [])
    n_etf = sum(1 for r in rows if r.get("type") == "etf")
    print(f"universe.json: 총 {len(rows)} (KR {n_kr}, US {n_us}, ETF {n_etf})")


if __name__ == "__main__":
    main()
