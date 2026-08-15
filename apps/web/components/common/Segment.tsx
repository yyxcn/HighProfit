"use client";

import { cn } from "@/lib/utils";

/** 라디오형 토글 (히트맵 스코프·기간, 펀드 히트맵 기간 등). 선택지가 3~6개일 때 쓴다. */
export function Segment({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (k: string) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-line bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "text-small px-2.5 py-1 rounded transition-colors",
            value === o.key ? "bg-raised text-fg" : "text-fg-dim hover:text-fg"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
