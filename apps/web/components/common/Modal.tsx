"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** 값이 바뀔 일이 없는 구독 — 서버 스냅샷(false)과 클라이언트 스냅샷(true) 만 구분하면 된다. */
const subscribeNoop = () => () => {};

/**
 * 화면 가운데 뜨는 창. 전체를 채우지 않고 폭·높이를 묶어 두어(기본 440px × 80vh)
 * 긴 목록을 좁은 칸에 아래로 펼치는 대신 여기서 읽게 한다.
 *
 * 닫기: X 버튼 · 바깥 클릭 · Esc. 열려 있는 동안 뒤 배경 스크롤은 잠근다.
 * 열림/닫힘 모두 DOM 에 남겨 두고 opacity/scale 로만 감춘다(트랜지션이 끊기지 않게).
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  // 정적 export(SSR 프리렌더)에서는 document 가 없다 → 클라이언트에서만 포털을 연다.
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);

  const closeRef = useRef<HTMLButtonElement>(null);
  // 열기 전 포커스를 기억했다가 닫을 때 되돌린다(키보드 사용자가 위치를 잃지 않게).
  const restoreRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement;
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      (restoreRef.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      // 바깥(여백) 클릭으로 닫는다 — 창 안쪽 클릭은 아래에서 멈춘다.
      onClick={onClose}
      aria-hidden={!open}
      inert={!open ? true : undefined}
      className={cn(
        "fixed inset-0 z-50 grid place-items-center p-4",
        "bg-black/50 transition-opacity duration-200",
        open ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex w-full max-w-[440px] max-h-[80vh] flex-col",
          "rounded-xl border border-line bg-surface shadow-2xl",
          "transition-[transform,opacity] duration-200 ease-out",
          open ? "scale-100 opacity-100" : "scale-95 opacity-0",
          className
        )}
      >
        <div className="flex items-start gap-2 border-b border-line px-3.5 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-fg font-semibold truncate">{title}</div>
            {subtitle && <div className="text-micro text-fg-mute mt-0.5">{subtitle}</div>}
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="닫기"
            className="shrink-0 rounded p-1 text-fg-mute transition-colors hover:bg-raised hover:text-fg"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">{children}</div>
      </div>
    </div>,
    document.body
  );
}
