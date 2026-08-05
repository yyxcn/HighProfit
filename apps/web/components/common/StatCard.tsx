import { cn } from "@/lib/utils";

/** 지표 카드. 숫자는 mono. 글래스 패널. */
export function StatCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "up" | "down" | "accent";
}) {
  const toneClass = {
    default: "text-fg",
    up: "text-up",
    down: "text-down",
    accent: "text-accent",
  }[tone];
  return (
    <div className="panel px-4 py-3">
      <div className="text-micro uppercase tracking-[0.12em] text-fg-mute">{label}</div>
      <div className={cn("num text-[22px] leading-tight mt-1.5", toneClass)}>{value}</div>
      {sub && <div className="text-small text-fg-dim mt-1">{sub}</div>}
    </div>
  );
}
