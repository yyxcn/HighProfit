"use client";

import { useEffect, useRef, useState } from "react";
import { Landmark, ChevronDown, Check } from "lucide-react";
import type { FundIndexEntry } from "@/lib/data";
import { compact } from "@/lib/format";
import { cn } from "@/lib/utils";

/** 펀드 선택 드롭다운. 트리거를 누르면 전체 펀드 목록이 펼쳐지고 하나를 고른다. */
export function FundPicker({
  funds,
  value,
  onSelect,
}: {
  funds: FundIndexEntry[];
  value: string | null;
  onSelect: (file: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = funds.find((f) => f.file === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative w-full max-w-md">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg border bg-surface px-3.5 py-2.5 text-left transition-colors",
          open ? "border-accent" : "border-line hover:border-accent/50"
        )}
      >
        <div className="grid place-items-center h-8 w-8 shrink-0 rounded-md bg-raised border border-line">
          <Landmark size={15} className="text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          {selected ? (
            <>
              <div className="text-fg text-sm font-semibold truncate">{selected.name}</div>
              <div className="num text-micro text-fg-mute mt-0.5">
                ${compact(selected.aum)} · {selected.positions}종목 · {selected.latest}
              </div>
            </>
          ) : (
            <span className="text-fg-dim text-sm">펀드 선택</span>
          )}
        </div>
        <ChevronDown
          size={16}
          className={cn("shrink-0 text-fg-mute transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="panel absolute z-30 mt-2 w-full max-h-[min(60vh,420px)] overflow-y-auto p-1.5 shadow-2xl"
        >
          {funds.length === 0 && (
            <p className="px-3 py-6 text-center text-small text-fg-mute">펀드가 없습니다.</p>
          )}
          {funds.map((f) => {
            const active = f.file === value;
            return (
              <button
                key={f.file}
                role="option"
                aria-selected={active}
                onClick={() => {
                  onSelect(f.file);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
                  active ? "bg-raised" : "hover:bg-raised/60"
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className={cn("text-sm truncate", active ? "text-accent font-semibold" : "text-fg")}>
                    {f.name}
                  </div>
                  <div className="num text-micro text-fg-mute mt-0.5">
                    ${compact(f.aum)} · {f.positions}종목 · {f.latest}
                  </div>
                </div>
                {active && <Check size={15} className="shrink-0 text-accent" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
