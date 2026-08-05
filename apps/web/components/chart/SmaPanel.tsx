"use client";

import { Plus, Trash2, Eye, EyeOff } from "lucide-react";
import type { SmaLine } from "@/lib/db";
import { cn } from "@/lib/utils";

const MAX = 10;
const NEXT_COLORS = ["#F2B441", "#E8875A", "#D96C8A", "#9B7FD4", "#5B8FD9", "#4EC9C0"];

export function SmaPanel({
  lines,
  onChange,
}: {
  lines: SmaLine[];
  onChange: (next: SmaLine[]) => void;
}) {
  const update = (id: string, patch: Partial<SmaLine>) =>
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const remove = (id: string) => onChange(lines.filter((l) => l.id !== id));
  const add = () => {
    if (lines.length >= MAX) return;
    const id = `s${Date.now()}`;
    const color = NEXT_COLORS[lines.length % NEXT_COLORS.length]!;
    onChange([...lines, { id, period: 20, color, visible: true }]);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-micro uppercase tracking-wide text-fg-mute">이동평균선</span>
        <button
          onClick={add}
          disabled={lines.length >= MAX}
          className="flex items-center gap-1 text-small text-fg-dim hover:text-fg disabled:opacity-40"
        >
          <Plus size={13} /> 추가
        </button>
      </div>

      {lines.map((l) => (
        <div key={l.id} className="flex items-center gap-2">
          <button
            onClick={() => update(l.id, { visible: !l.visible })}
            className={cn("shrink-0", l.visible ? "text-fg" : "text-fg-mute")}
            aria-label={l.visible ? "숨기기" : "표시"}
          >
            {l.visible ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
          <label className="relative shrink-0" aria-label="색상">
            <span
              className="block w-3.5 h-3.5 rounded-full border border-line"
              style={{ background: l.color }}
            />
            <input
              type="color"
              value={l.color}
              onChange={(e) => update(l.id, { color: e.target.value })}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
          </label>
          <input
            type="number"
            min={1}
            max={500}
            value={l.period}
            onChange={(e) => update(l.id, { period: Math.max(1, +e.target.value || 1) })}
            className="num w-14 bg-raised border border-line rounded px-1.5 py-0.5 text-small text-fg outline-none focus:border-accent"
          />
          <span className="text-small text-fg-mute flex-1">일</span>
          <button
            onClick={() => remove(l.id)}
            className="text-fg-mute hover:text-down shrink-0"
            aria-label="삭제"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
