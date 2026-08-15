"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Landmark, ChevronDown, Check, Search } from "lucide-react";
import type { FundIndexEntry } from "@/lib/data";
import { compact } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * 펀드 검색 + 선택 드롭다운. 트리거를 누르면 목록이 펼쳐지고 하나를 고른다.
 * 위에 붙은 검색창은 그 목록을 좁히며(펀드명·매니저·카테고리), 입력을 시작하면 목록을 자동으로 편다
 * — 쳐 놓고 왜 아무 일도 안 일어나나 싶은 상태를 만들지 않으려고.
 * `leading` 은 테두리 **안쪽 왼쪽**에 붙는 슬롯(관심 별표) — 버튼 중첩을 피하려고
 * 트리거와 형제로 두고 테두리는 바깥 래퍼가 그린다.
 */
export function FundPicker({
  funds,
  value,
  onSelect,
  leading,
}: {
  funds: FundIndexEntry[];
  value: string | null;
  onSelect: (file: string) => void;
  leading?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selected = funds.find((f) => f.file === value) ?? null;

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return funds;
    return funds.filter((f) =>
      [f.name, f.manager, f.category].some((v) => v?.toLowerCase().includes(needle))
    );
  }, [funds, q]);

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
    // h-full + 트리거 flex-1 → 왼쪽 요약 카드와 같은 높이가 되어 아래 빈 칸이 남지 않는다
    <div ref={ref} className="relative flex h-full w-full flex-col gap-2.5">
      <div className="relative shrink-0">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-mute"
        />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (e.target.value) setOpen(true);
          }}
          onFocus={() => q && setOpen(true)}
          placeholder="펀드 · 매니저 검색"
          className="w-full rounded-lg border border-line bg-surface py-2.5 pl-9 pr-3 text-sm text-fg placeholder:text-fg-mute focus:border-accent focus:outline-none"
        />
      </div>

      <div
        className={cn(
          "flex min-h-[4.5rem] flex-1 items-stretch rounded-lg border bg-surface transition-colors",
          open ? "border-accent" : "border-line hover:border-accent/50"
        )}
      >
        {leading}
        <button
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3.5 rounded-r-lg px-4 py-3 text-left"
        >
          <div className="grid place-items-center h-10 w-10 shrink-0 rounded-md bg-raised border border-line">
            <Landmark size={18} className="text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            {selected ? (
              <>
                <div className="text-fg text-base font-semibold truncate">{selected.name}</div>
                <div className="num text-small text-fg-mute mt-0.5">
                  ${compact(selected.aum)} · {selected.positions}종목 · {selected.latest}
                </div>
              </>
            ) : (
              <span className="text-fg-dim text-base">펀드 선택</span>
            )}
          </div>
          <ChevronDown
            size={18}
            className={cn("shrink-0 text-fg-mute transition-transform", open && "rotate-180")}
          />
        </button>
      </div>

      {open && (
        // 목록 뒤로 도넛·표가 비쳐 읽기 어려워지므로 글래스(.panel)를 쓰지 않고 불투명하게 깐다.
        <div
          role="listbox"
          className="absolute z-30 mt-2 w-full max-h-[min(60vh,420px)] overflow-y-auto rounded-[var(--radius)] border border-line bg-surface p-1.5 shadow-2xl"
        >
          {shown.length === 0 && (
            <p className="px-3 py-6 text-center text-small text-fg-mute">
              {funds.length === 0 ? "펀드가 없습니다." : "검색 결과가 없습니다."}
            </p>
          )}
          {shown.map((f) => {
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
