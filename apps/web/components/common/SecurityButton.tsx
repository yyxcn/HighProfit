"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import type { UniverseItem } from "@highprofit/core";
import { SecurityPicker, MarketBadge } from "./SecurityPicker";

/** 인라인 종목 선택 트리거 (계절성/백테스트에서 재사용). */
export function SecurityButton({
  value,
  onSelect,
  predicate,
  placeholder = "종목 선택",
}: {
  value?: UniverseItem | null;
  onSelect: (it: UniverseItem) => void;
  predicate?: (it: UniverseItem) => boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 h-9 px-3 rounded-md border border-line bg-raised hover:border-accent transition-colors text-sm"
      >
        <Search size={14} className="text-fg-mute" />
        {value ? (
          <>
            <span className="num text-fg-dim text-small">{value.t}</span>
            <span className="text-fg">{value.n}</span>
            <MarketBadge market={value.m} type={value.type} />
          </>
        ) : (
          <span className="text-fg-dim">{placeholder}</span>
        )}
      </button>
      <SecurityPicker open={open} onOpenChange={setOpen} onSelect={onSelect} predicate={predicate} />
    </>
  );
}
