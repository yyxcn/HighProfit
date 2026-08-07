import { cn } from "@/lib/utils";

/**
 * BrandGlyph — HighProfit 시그니처 마크.
 * 우상향 트렌드(성장) 화살표를 페리윙클 액센트 단색 모노라인으로 그린다.
 * 색은 `currentColor` 상속 → 뱃지의 `text-accent`/`text-white` 클래스에 따라간다.
 * (초록/빨강은 손익 전용이라 로고엔 쓰지 않는다 — 강조는 페리윙클.)
 */
export function BrandGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("h-[62%] w-[62%]", className)}
    >
      {/* 변동성 있는 우상향 트렌드 라인 */}
      <path d="M4 14.5 L9 10 L12.5 13 L20 5.5" />
      {/* 화살촉 */}
      <path d="M14.75 5.5 L20 5.5 L20 10.75" />
    </svg>
  );
}
