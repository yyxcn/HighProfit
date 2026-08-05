"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useUniverse, filterUniverse } from "@/lib/universe";
import { getRecent, pushRecent, type RecentSearch } from "@/lib/db";
import { compactEok } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { UniverseItem } from "@highprofit/core";

export interface SecurityPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: UniverseItem) => void;
  /** 결과 사전 필터 (예: ETF 만) */
  predicate?: (it: UniverseItem) => boolean;
  title?: string;
}

export function SecurityPicker({
  open,
  onOpenChange,
  onSelect,
  predicate,
  title = "종목 검색",
}: SecurityPickerProps) {
  const { items, loading } = useUniverse();
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const pool = useMemo(
    () => (predicate ? items.filter(predicate) : items),
    [items, predicate]
  );
  const results = useMemo(() => filterUniverse(pool, q, 50), [pool, q]);

  useEffect(() => {
    if (open) {
      setQ("");
      setCursor(0);
      getRecent().then(setRecent);
      queueMicrotask(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setCursor(0), [q]);

  if (!open) return null;

  const choose = (it: UniverseItem) => {
    pushRecent({ key: `${it.m}:${it.t}`, ticker: it.t, name: it.n, market: it.m });
    onSelect(it);
    onOpenChange(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = results[cursor];
      if (it) choose(it);
    } else if (e.key === "Escape") {
      onOpenChange(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[10vh] px-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-line bg-surface shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 h-12 border-b border-line">
          <Search size={16} className="text-fg-mute shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder={`${title} — 종목명 또는 티커`}
            className="flex-1 bg-transparent outline-none text-fg placeholder:text-fg-mute text-sm"
          />
          <button onClick={() => onOpenChange(false)} aria-label="닫기" className="text-fg-mute hover:text-fg">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[50vh] overflow-auto py-1">
          {loading && <RowMsg>유니버스를 불러오는 중…</RowMsg>}
          {!loading && items.length === 0 && (
            <RowMsg>데이터를 불러오지 못했습니다. 파이프라인 실행 후 다시 시도하세요.</RowMsg>
          )}
          {!loading && items.length > 0 && q === "" && recent.length > 0 && (
            <div className="px-3 pt-2 pb-1 text-micro uppercase tracking-wide text-fg-mute">최근 검색</div>
          )}
          {!loading &&
            results.map((it, i) => (
              <button
                key={`${it.m}:${it.t}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => choose(it)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 text-left",
                  i === cursor ? "bg-raised" : "hover:bg-raised/50"
                )}
              >
                <span className="num text-fg-dim w-20 shrink-0 text-small">{it.t}</span>
                <span className="flex-1 truncate text-fg text-sm">{it.n}</span>
                <MarketBadge market={it.m} type={it.type} />
                <span className="text-fg-mute text-small w-24 text-right truncate hidden sm:block">
                  {it.s}
                </span>
                <span className="num text-fg-mute text-small w-16 text-right hidden sm:block">
                  {compactEok(it.c)}
                </span>
              </button>
            ))}
          {!loading && items.length > 0 && results.length === 0 && (
            <RowMsg>&ldquo;{q}&rdquo; 검색 결과가 없습니다.</RowMsg>
          )}
        </div>
      </div>
    </div>
  );
}

function RowMsg({ children }: { children: React.ReactNode }) {
  return <div className="px-3 py-6 text-center text-fg-dim text-small">{children}</div>;
}

export function MarketBadge({ market, type }: { market: string; type?: string }) {
  const label = type === "etf" ? "ETF" : market;
  return (
    <span className="num text-micro px-1.5 py-0.5 rounded border border-line text-fg-dim shrink-0">
      {label}
    </span>
  );
}
