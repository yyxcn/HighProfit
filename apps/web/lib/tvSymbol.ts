import type { Market } from "@highprofit/core";

/**
 * 우리 (market, ticker) → TradingView 심볼.
 * KR: KRX:005930 형식. US: 접두사 없이 티커만 넘기면 TV가 자동 해석(우리 universe의
 * exchange 가 "US"로 뭉개진 경우가 많아 접두사를 강제하지 않는다).
 */
export function tvSymbol(market: Market, ticker: string, exchange?: string): string {
  if (market === "KR") return `KRX:${ticker}`;
  // US: 알려진 거래소면 접두사 부여, 아니면 티커만
  const ex = (exchange ?? "").toUpperCase();
  if (ex === "NASDAQ" || ex === "NYSE" || ex === "AMEX") return `${ex}:${ticker}`;
  return ticker;
}
