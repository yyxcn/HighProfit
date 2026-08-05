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

export interface FundIndexEntry {
  cik: string;
  name: string;
  latest: string; // 'YYYYQn'
  file: string; // funds/<cik>_<quarter>.json
  aum: number;
  positions: number;
  filedAt: string;
}
export interface FundIndex {
  asOf: string;
  funds: FundIndexEntry[];
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
