"use client";

import { create } from "zustand";
import { Sun, Moon } from "lucide-react";

export type Theme = "dark" | "light";

function initialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const s = localStorage.getItem("hp-theme");
  return s === "light" ? "light" : "dark";
}

interface ThemeState {
  theme: Theme;
  set: (t: Theme) => void;
  toggle: () => void;
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: initialTheme(),
  set: (t) => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = t;
      localStorage.setItem("hp-theme", t);
    }
    set({ theme: t });
  },
  toggle: () => get().set(get().theme === "dark" ? "light" : "dark"),
}));

/** 상단바 다크/라이트 전환 버튼 */
export function ThemeToggle() {
  const theme = useTheme((s) => s.theme);
  const toggle = useTheme((s) => s.toggle);
  const Icon = theme === "dark" ? Sun : Moon;
  return (
    <button
      onClick={toggle}
      aria-label={theme === "dark" ? "라이트 모드로" : "다크 모드로"}
      className="grid place-items-center h-8 w-8 rounded-lg border border-line bg-surface/60 text-fg-dim hover:text-accent hover:border-accent/50 transition-all"
    >
      <Icon size={15} />
    </button>
  );
}

// ── 차트 팔레트 (하드코딩 색을 테마 연동) ──────────
export interface ChartColors {
  grid: string;
  axis: string;
  axisText: string;
  line: string; // 흰/검 계열 주선
  accent: string;
  up: string;
  down: string;
  zero: string;
  benchmark: string;
  tileStroke: string;
  headerText: string;
}

const DARK: ChartColors = {
  grid: "#262626",
  axis: "#262626",
  axisText: "#71767f",
  line: "#ededec",
  accent: "#adc6ff",
  up: "#22c55e",
  down: "#ef4444",
  zero: "#5a6675",
  benchmark: "#8b90a0",
  tileStroke: "#0a0a0a",
  headerText: "#b4b8c5",
};

const LIGHT: ChartColors = {
  grid: "#e3e6eb",
  axis: "#e3e6eb",
  axisText: "#8b929e",
  line: "#191c22",
  accent: "#4361ee",
  up: "#16a34a",
  down: "#dc2626",
  zero: "#9aa3b2",
  benchmark: "#94a3b8",
  tileStroke: "#ffffff",
  headerText: "#4b5563",
};

export function useChartColors(): ChartColors {
  return useTheme((s) => s.theme) === "light" ? LIGHT : DARK;
}
