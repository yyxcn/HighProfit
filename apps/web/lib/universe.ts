"use client";

import { useEffect, useState } from "react";
import { getUniverse } from "@/lib/data";
import type { UniverseItem } from "@highprofit/core";

let memo: UniverseItem[] | null = null;
let inflight: Promise<UniverseItem[]> | null = null;

async function load(): Promise<UniverseItem[]> {
  if (memo) return memo;
  if (!inflight) {
    inflight = getUniverse()
      .then((u) => {
        memo = u;
        return u;
      })
      .catch(() => {
        memo = [];
        return [];
      });
  }
  return inflight;
}

/** universe.json 을 최초 1회 로드해 메모리 유지 → 클라이언트 필터 (명세 6-1). */
export function useUniverse() {
  const [items, setItems] = useState<UniverseItem[]>(memo ?? []);
  const [loading, setLoading] = useState(!memo);
  useEffect(() => {
    let alive = true;
    if (memo) {
      setItems(memo);
      setLoading(false);
      return;
    }
    load().then((u) => {
      if (!alive) return;
      setItems(u);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);
  return { items, loading };
}

/** 종목명·티커 substring 매칭 (대소문자·언어 무시). 시총 내림차순. */
export function filterUniverse(
  items: UniverseItem[],
  query: string,
  limit = 50
): UniverseItem[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...items].sort((a, b) => b.c - a.c).slice(0, limit);
  }
  const hits = items.filter(
    (it) => it.t.toLowerCase().includes(q) || it.n.toLowerCase().includes(q)
  );
  return hits.sort((a, b) => b.c - a.c).slice(0, limit);
}
