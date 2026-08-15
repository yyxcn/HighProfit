/**
 * 시가총액 구간 분류.
 *
 * `universe.json` 의 `c` 는 **억 KRW** 로 저장돼 있다 — KR/US 를 히트맵 한 축(트리맵 면적)에
 * 놓으려고 파이프라인이 고정 환율로 환산해 둔 값이다(`pipeline/lib/io.py` 의 `USDKRW`).
 * 정밀 환율이 아니라 표시 스케일 통일용이므로, 여기 상수도 **그 값과 같아야** 구간이 어긋나지 않는다.
 */
export const USDKRW = 1300;

/** 억 KRW → USD */
export function eokToUsd(capEok: number): number {
  return (capEok * 1e8) / USDKRW;
}

export type CapBand = 'large' | 'mid' | 'small' | 'unknown';

/** 구간 경계 (USD). 대형 $10B↑, 중형 $2B~10B, 소형 $2B↓ — 미국 시장의 통상 구분. */
export const CAP_THRESHOLD = { large: 1e10, mid: 2e9 } as const;

/**
 * 억 KRW 단위 시총 → 구간. 값이 없거나 0 이하면 `unknown`
 * (시총을 못 받은 종목을 소형주로 몰면 분포가 왜곡된다).
 */
export function capBand(capEok: number | null | undefined): CapBand {
  if (!capEok || capEok <= 0) return 'unknown';
  const usd = eokToUsd(capEok);
  if (usd >= CAP_THRESHOLD.large) return 'large';
  if (usd >= CAP_THRESHOLD.mid) return 'mid';
  return 'small';
}
