"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV } from "./nav";
import { cn } from "@/lib/utils";
import { getMeta } from "@/lib/data";
import { stamp } from "@/lib/format";
import type { Meta } from "@highprofit/core";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex flex-col border-r border-line bg-surface/40 backdrop-blur-xl md:w-[76px] xl:w-[228px] shrink-0">
      <div className="h-14 flex items-center px-5 border-b border-line">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid place-items-center h-7 w-7 rounded-lg bg-accent/15 border border-accent/30 text-accent font-display text-sm leading-none">
            H
          </span>
          <span className="font-display text-fg text-[17px] hidden xl:inline tracking-tight">HighProfit</span>
        </Link>
      </div>

      <nav className="flex-1 py-3 px-2.5 space-y-0.5">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all",
                "xl:justify-start justify-center",
                active
                  ? "bg-accent/10 text-fg border border-accent/25"
                  : "text-fg-dim hover:text-fg hover:bg-raised/60 border border-transparent"
              )}
            >
              <Icon size={18} strokeWidth={active ? 2 : 1.75} className={cn("shrink-0", active && "text-accent")} />
              <span className="hidden xl:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <LastUpdated />
    </aside>
  );
}

function LastUpdated() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    getMeta().then(setMeta).catch(() => setErr(true));
  }, []);

  const latest = meta
    ? [meta.lastUpdatedKR, meta.lastUpdatedUS].filter(Boolean).sort().pop() ?? null
    : null;

  return (
    <div className="border-t border-line px-5 py-3.5 text-fg-mute hidden xl:block">
      <div className="text-micro uppercase tracking-[0.12em]">마지막 갱신</div>
      <div className="num text-small text-fg-dim mt-1">
        {err ? "데이터 대기 중" : latest ? stamp(latest) : "…"}
      </div>
    </div>
  );
}
