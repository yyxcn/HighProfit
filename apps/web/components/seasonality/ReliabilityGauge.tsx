"use client";

/**
 * 패턴 신뢰도 게이지. 정직성 지표(명세 6-3) 시각화:
 * 12개월 중 통계적으로 유의(|t|≥2)한 달의 비율을 점수화한다.
 * 게이지 호는 UI 강조색(페리윙클) — 손익 방향색(초록/빨강) 아님.
 */
export function ReliabilityGauge({ significant }: { significant: number }) {
  const score = Math.round((significant / 12) * 100);
  const R = 42;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - score / 100);

  const { tier, tone } =
    significant >= 8
      ? { tier: "강한 계절성", tone: "text-mint" }
      : significant >= 5
        ? { tier: "뚜렷한 편", tone: "text-accent" }
        : significant >= 3
          ? { tier: "보통", tone: "text-fg-dim" }
          : { tier: "약함 · 노이즈 우세", tone: "text-fg-mute" };

  return (
    <div className="flex items-center gap-5">
      <div className="relative grid place-items-center h-[104px] w-[104px] shrink-0">
        <svg className="-rotate-90" width="104" height="104" viewBox="0 0 104 104">
          <circle cx="52" cy="52" r={R} fill="none" stroke="var(--color-line)" strokeWidth="8" />
          <circle
            cx="52"
            cy="52"
            r={R}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1)" }}
          />
        </svg>
        <div className="absolute flex flex-col items-center leading-none">
          <span className="num text-[26px] text-fg">{score}</span>
          <span className="text-micro text-fg-mute mt-0.5">/ 100</span>
        </div>
      </div>
      <div className="min-w-0">
        <div className={`text-body font-medium ${tone}`}>{tier}</div>
        <p className="text-small text-fg-dim mt-1 leading-snug">
          12개월 중 <span className="num text-fg">{significant}</span>개월이 통계적으로 유의
          <span className="text-fg-mute"> (|t|≥2)</span>. 유의한 달이 많을수록 반복되는 계절성일
          가능성이 높습니다.
        </p>
      </div>
    </div>
  );
}
