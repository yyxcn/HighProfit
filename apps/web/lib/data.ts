import type { Bar, Meta, SectorsFile, UniverseItem, Market } from "@highprofit/core";

/**
 * R2(또는 로컬 public/data) 정적 데이터 접근 단일 게이트.
 * 메모리 캐시 + 재시도 1회. 모든 fetch 는 여기만 통한다 (명세 8).
 */
const BASE = (process.env.NEXT_PUBLIC_DATA_BASE ?? "/data").replace(/\/$/, "");

const cache = new Map<string, unknown>();

async function fetchWithRetry(url: string): Promise<Response> {
  try {
    // no-cache: 조건부 요청으로 매번 재검증(변경 없으면 304, 저렴). 배치 갱신 즉시 반영.
    // force-cache 는 갱신돼도 옛 데이터를 계속 보여줘서 쓰면 안 된다.
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) throw new Error(`${r.status}`);
    return r;
  } catch {
    // 재시도 1회
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`데이터를 불러오지 못했습니다 (${url})`);
    return r;
  }
}

async function getJSON<T>(path: string): Promise<T> {
  const key = `json:${path}`;
  if (cache.has(key)) return cache.get(key) as T;
  const r = await fetchWithRetry(`${BASE}/${path}`);
  const data = (await r.json()) as T;
  cache.set(key, data);
  return data;
}

export function dataUrl(path: string): string {
  return `${BASE}/${path.replace(/^\//, "")}`;
}

export async function getMeta(): Promise<Meta> {
  return getJSON<Meta>("meta.json");
}

export async function getUniverse(): Promise<UniverseItem[]> {
  return getJSON<UniverseItem[]>("universe.json");
}

export async function getSectors(scope: Market | "ETF"): Promise<SectorsFile> {
  return getJSON<SectorsFile>(`sectors/${scope}.json`);
}

/**
 * 종목 OHLCV. parquet 를 브라우저에서 직접 파싱 (hyparquet, 순수 JS).
 * 종목당 1파일이라 한 종목 열 때 100KB 안팎만 내려받는다 (명세 5-2).
 */
export async function getBars(market: Market, ticker: string): Promise<Bar[]> {
  const key = `bars:${market}:${ticker}`;
  if (cache.has(key)) return cache.get(key) as Bar[];

  const r = await fetchWithRetry(dataUrl(`ohlcv/${market}/${ticker}.parquet`));
  const buf = await r.arrayBuffer();
  const { parquetReadObjects } = await import("hyparquet");
  const rows = (await parquetReadObjects({ file: buf })) as Record<string, unknown>[];
  const bars: Bar[] = rows.map((row) => ({
    date: String(row.date),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
  }));
  bars.sort((a, b) => (a.date < b.date ? -1 : 1));
  cache.set(key, bars);
  return bars;
}

/** 펀드 목록/보유내역 (분기 파이프라인 산출물) */
export async function getFundsIndex(): Promise<FundIndex> {
  return getJSON<FundIndex>("funds/index.json");
}

export async function getFundHolding(file: string): Promise<FundHolding> {
  return getJSON<FundHolding>(`funds/${file}`);
}

/** 펀드 성과 랭킹 (Overview 탭). build_fund_stats.py 산출물 */
export async function getFundPerformance(): Promise<FundPerformanceFile> {
  return getJSON<FundPerformanceFile>("funds/performance.json");
}

/** 분기별 인기 보유/신규 매수/청산 (인기 주식 탭) */
export async function getFundPopular(): Promise<FundPopularFile> {
  return getJSON<FundPopularFile>("funds/popular.json");
}

export interface FundIndexEntry {
  cik: string;
  name: string;
  manager: string;
  category: string;
  latest: string; // 'YYYYQn'
  file: string; // funds/<cik>_<quarter>.json
  aum: number;
  positions: number;
  filedAt: string;
  inception: string; // 성과 계산이 가능한 첫 분기
  quarters: number;
}
export interface FundIndex {
  asOf: string;
  funds: FundIndexEntry[];
}

/** 매핑 커버리지 기반 추정 신뢰도 — high 는 UI 에서 표시하지 않는다 */
export type FundReliability = "high" | "mid" | "low";

export interface FundPerformance {
  cik: string;
  name: string;
  manager: string;
  category: string;
  inception: string; // 'YYYYQn'
  inceptionDate: string; // 'YYYY-MM-DD'
  latest: string; // 마지막으로 13F를 낸 분기
  filedAt: string; // 'YYYY-MM-DD' — 그 분기를 실제로 신고한 날(분기말이 아니다)
  active: boolean; // 공시가 끊긴 펀드는 아예 랭킹에서 빠지므로 항상 true
  quarters: number;
  aum: number;
  positions: number;
  ret1y: number | null;
  cagr3y: number | null;
  cagr5y: number | null;
  cagrInception: number | null;
  totalReturn: number;
  coverage: number; // 0~1, 가치 기준 티커 매핑률
  reliability: FundReliability;
  curve: [string, number][]; // 월말 [날짜, 지수(시작=1)]
}
export interface FundPerformanceFile {
  asOf: string;
  funds: FundPerformance[];
}

export interface PopularStock {
  cusip: string;
  ticker: string | null;
  name: string;
  managers: number;
  value: number;
  top: string[]; // 평가액 상위 3 매니저
}
export type PopularKind = "hold" | "new" | "exit";
export interface PopularQuarter {
  quarter: string;
  filed: number; // 이 분기에 신고한 펀드 수
  total: number;
  all: Record<PopularKind, PopularStock[]>;
  focused: Record<PopularKind, PopularStock[]>; // 인덱스성(광범위 보유) 펀드 제외
}
export interface FundPopularFile {
  asOf: string;
  topN: number;
  broadThreshold: number;
  quarters: PopularQuarter[];
}

export type HoldingChange = "new" | "add" | "reduce" | "exit" | "hold";
export interface FundPosition {
  cusip: string;
  ticker: string | null;
  name: string;
  value: number; // 평가액 (USD, 천 단위)
  shares: number;
  weight: number; // 0~1
  change: HoldingChange;
  deltaShares: number;
}
export interface FundHolding {
  cik: string;
  name: string;
  quarter: string;
  filedAt: string;
  aum: number;
  positions: FundPosition[];
}
