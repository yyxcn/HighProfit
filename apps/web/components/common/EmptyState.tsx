import type { LucideIcon } from "lucide-react";

/** 빈 화면은 안내가 아니라 행동 유도 (명세 4-6). */
export function EmptyState({
  icon: Icon,
  title,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      {Icon && <Icon size={32} className="text-fg-mute" strokeWidth={1.5} />}
      <p className="text-fg-dim text-sm max-w-sm">{title}</p>
      {action}
    </div>
  );
}
