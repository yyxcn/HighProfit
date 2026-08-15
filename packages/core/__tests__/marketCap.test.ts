import { describe, it, expect } from 'vitest';
import { capBand, eokToUsd, USDKRW, CAP_THRESHOLD } from '../src/marketCap';

/** 억 KRW 로 환산된 시총 (파이프라인이 저장하는 형태) */
function eok(usd: number): number {
  return (usd * USDKRW) / 1e8;
}

describe('marketCap', () => {
  it('환율은 파이프라인(pipeline/lib/io.py USDKRW)과 같은 값', () => {
    expect(USDKRW).toBe(1300);
  });

  it('억 KRW ↔ USD 왕복', () => {
    // $10B → 10e9 * 1300 / 1e8 = 130,000 억원
    expect(eok(1e10)).toBeCloseTo(130_000, 6);
    expect(eokToUsd(130_000)).toBeCloseTo(1e10, 0);
  });

  it('경계값은 위쪽 구간에 포함된다', () => {
    expect(capBand(eok(CAP_THRESHOLD.large))).toBe('large'); // 정확히 $10B → 대형
    expect(capBand(eok(CAP_THRESHOLD.mid))).toBe('mid'); // 정확히 $2B → 중형
    expect(capBand(eok(CAP_THRESHOLD.large - 1))).toBe('mid');
    expect(capBand(eok(CAP_THRESHOLD.mid - 1))).toBe('small');
  });

  it('대표 사례', () => {
    expect(capBand(eok(3e12))).toBe('large'); // $3T 초대형
    expect(capBand(eok(5e9))).toBe('mid'); // $5B
    expect(capBand(eok(3e8))).toBe('small'); // $300M
  });

  it('시총을 못 받은 종목은 unknown — 소형주로 몰면 분포가 왜곡된다', () => {
    expect(capBand(0)).toBe('unknown');
    expect(capBand(null)).toBe('unknown');
    expect(capBand(undefined)).toBe('unknown');
    expect(capBand(-5)).toBe('unknown');
  });
});
