"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { create } from "zustand";
import { SecurityPicker } from "./SecurityPicker";

interface SearchState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

/** 전역 ⌘K 팔레트 상태. */
export const useSearch = create<SearchState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));

/** 전역 종목 검색. 선택 시 차트 탭으로 이동. */
export function TickerSearch() {
  const router = useRouter();
  const { isOpen, open, close } = useSearch();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <SecurityPicker
      open={isOpen}
      onOpenChange={(o) => (o ? open() : close())}
      onSelect={(it) => router.push(`/chart?m=${it.m}&t=${it.t}`)}
    />
  );
}
