"use client";

import { useEffect, useState } from "react";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * 마운트 직후 `ms` 동안만 true — 첫 그리기 애니메이션 1회용 스위치.
 * 이후 false 로 내려가므로 기간·옵션 변경 같은 데이터 갱신엔 애니메이션이 다시 붙지 않는다.
 * `prefers-reduced-motion: reduce` 환경에선 처음부터 false.
 */
export function useIntroAnimation(ms: number): boolean {
  const [on, setOn] = useState(() => !prefersReducedMotion());

  useEffect(() => {
    if (!on) return;
    const id = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(id);
  }, [on, ms]);

  return on;
}
