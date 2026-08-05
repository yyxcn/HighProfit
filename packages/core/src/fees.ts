/**
 * 수수료·세금 상수. 반드시 이 파일 한 곳에만 둔다.
 * 시행일 주석 필수 — 세율은 바뀐다.
 */

/** 국내 매도 시 부과 (매수 시에는 증권거래세·농특세 없음). */
export const KR_TAX = {
  /** 2026-01-01 기준. 코스피: 거래세 0.05% + 농어촌특별세 0.15% = 0.20% */
  KOSPI_SELL: 0.002,
  /** 2026-01-01 기준. 코스닥: 거래세 0.20% (농특세 없음) = 0.20% */
  KOSDAQ_SELL: 0.002,
  /** 주식형 ETF 매도세: 비과세 */
  STOCK_ETF_SELL: 0,
} as const;

/** 위탁 매매수수료 가정치 (증권사별 상이, 백테스트 기본 왕복값). */
export const DEFAULT_ROUND_TRIP_COST = 0.002; // 0.2% 왕복

/** 무위험수익률 기본값 (Sharpe/Sortino). 2026 기준 개략치. */
export const DEFAULT_RF = 0.03;

/** 시행일 메모. UI 고지에 사용. */
export const FEE_EFFECTIVE_DATE = '2026-01-01';
