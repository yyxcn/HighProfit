import { openDB, type DBSchema, type IDBPDatabase } from "idb";

/**
 * 개인 데이터 로컬 저장 (IndexedDB). 서버 없음 (명세 0).
 * - recent: 최근 검색 티커
 * - sma: 차트 SMA 설정
 * - kv: 기타 설정
 */
interface HPDB extends DBSchema {
  recent: { key: string; value: RecentSearch };
  kv: { key: string; value: unknown };
}

export interface RecentSearch {
  key: string; // `${market}:${ticker}`
  ticker: string;
  name: string;
  market: string;
  at: number;
}

export interface SmaLine {
  id: string;
  period: number;
  color: string;
  visible: boolean;
}

let dbp: Promise<IDBPDatabase<HPDB>> | null = null;

function db() {
  if (typeof indexedDB === "undefined") return null;
  if (!dbp) {
    dbp = openDB<HPDB>("highprofit", 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains("recent")) d.createObjectStore("recent", { keyPath: "key" });
        if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv");
      },
    });
  }
  return dbp;
}

export async function pushRecent(s: Omit<RecentSearch, "at">, limit = 5): Promise<void> {
  const d = await db();
  if (!d) return;
  await d.put("recent", { ...s, at: Date.now() });
  const all = await d.getAll("recent");
  all.sort((a, b) => b.at - a.at);
  for (const extra of all.slice(limit)) await d.delete("recent", extra.key);
}

export async function getRecent(limit = 5): Promise<RecentSearch[]> {
  const d = await db();
  if (!d) return [];
  const all = await d.getAll("recent");
  return all.sort((a, b) => b.at - a.at).slice(0, limit);
}

export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  const d = await db();
  if (!d) return fallback;
  const v = await d.get("kv", key);
  return (v as T) ?? fallback;
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  const d = await db();
  if (!d) return;
  await d.put("kv", value, key);
}

export const DEFAULT_SMA: SmaLine[] = [
  { id: "s5", period: 5, color: "#F2B441", visible: true },
  { id: "s10", period: 10, color: "#E8875A", visible: true },
  { id: "s20", period: 20, color: "#D96C8A", visible: true },
  { id: "s50", period: 50, color: "#9B7FD4", visible: true },
  { id: "s100", period: 100, color: "#5B8FD9", visible: false },
  { id: "s200", period: 200, color: "#4EC9C0", visible: true },
];
