/**
 * 공용 도메인 타입. React/DOM 의존성 없음.
 * 날짜는 항상 'YYYY-MM-DD' 문자열 (타임존 사고 방지).
 */

export type Market = 'KR' | 'US';
export type SecurityType = 'stock' | 'etf';

/** OHLCV 한 봉. close 는 반드시 수정주가. */
export interface Bar {
  date: string; // 'YYYY-MM-DD'
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** universe.json 한 항목 (짧은 키는 전송량 절감용) */
export interface UniverseItem {
  t: string; // ticker
  n: string; // name
  m: Market; // market
  e: string; // exchange
  s: string; // sector
  c: number; // market cap (억)
  type: SecurityType;
}

export type Period = '1d' | '5d' | '1m' | '3m' | '6m' | '1y';

export interface SectorReturns {
  '1d': number;
  '5d': number;
  '1m': number;
  '3m': number;
  '6m': number;
  '1y': number;
}

export interface SectorConstituent {
  t: string;
  n: string;
  m?: Market; // 클릭 시 차트 이동용 (ETF 스코프는 KR/US 혼재)
  cap: number;
  ret: SectorReturns;
}

export interface Sector {
  name: string;
  cap: number;
  ret: SectorReturns;
  top: SectorConstituent[];
}

export interface SectorsFile {
  asOf: string;
  sectors: Sector[];
}

export interface Meta {
  lastUpdatedKR: string | null;
  lastUpdatedUS: string | null;
  lastUpdated13F: string | null;
}
