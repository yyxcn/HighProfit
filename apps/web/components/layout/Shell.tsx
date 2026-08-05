"use client";

import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { BottomBar } from "./BottomBar";
import { tabTitle } from "./nav";
import { TickerSearch, useSearch } from "@/components/common/TickerSearch";
import { ThemeToggle } from "@/lib/theme";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const open = useSearch((s) => s.open);

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        {/* 상단바 — 글래스 */}
        <header className="h-14 shrink-0 flex items-center justify-between px-5 border-b border-line bg-ink/70 backdrop-blur-xl z-20">
          <div className="flex-1 flex items-center gap-2.5 min-w-0">
            <span className="h-1.5 w-1.5 rounded-full bg-mint shadow-[0_0_8px_var(--color-mint)]" />
            <h1 className="text-sm font-semibold text-fg tracking-tight">{tabTitle(pathname)}</h1>
          </div>
          <button
            onClick={() => open()}
            className="group flex items-center gap-2 h-8 pl-3 pr-2 sm:w-80 md:w-[25rem] rounded-lg border border-line bg-raised/70 text-fg-dim hover:text-fg hover:border-accent/60 hover:bg-raised text-small transition-all"
            aria-label="종목 검색"
          >
            <Search size={15} className="shrink-0 text-accent" />
            <span className="hidden sm:inline">종목 검색</span>
            <kbd className="num text-micro text-fg-mute border border-line rounded px-1 py-0.5 group-hover:border-accent/40 sm:ml-auto">
              ⌘K
            </kbd>
          </button>
          <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
            <ThemeToggle />
          </div>
        </header>

        {/* 컨텐츠 — 도트 그리드 + 상단 광원 (isolate + 음수 z 로 배경에, 자식 높이 체인 유지) */}
        <main className="relative isolate flex-1 overflow-auto pb-20 md:pb-0">
          <div className="absolute inset-0 dot-grid opacity-60 pointer-events-none -z-10" />
          <div className="absolute inset-x-0 top-0 h-80 aura pointer-events-none -z-10" />
          {children}
        </main>
      </div>

      <BottomBar />
      <TickerSearch />
    </div>
  );
}
