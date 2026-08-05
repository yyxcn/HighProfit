/**
 * 숫자 포맷 단일 소스 (명세 8). 모든 화면이 여기만 통해 포맷한다.
 */

/** 백분율. 부호 표시 옵션. 예: 0.0421 → "+4.21%" */
export function pct(x: number | null | undefined, digits = 2, sign = true): string {
  if (x == null || !isFinite(x)) return "—";
  const v = x * 100;
  const s = v.toFixed(digits);
  return `${sign && v > 0 ? "+" : ""}${s}%`;
}

/** 원화. 예: 12345678 → "12,345,678원" */
export function won(x: number | null | undefined, withUnit = true): string {
  if (x == null || !isFinite(x)) return "—";
  return `${Math.round(x).toLocaleString("ko-KR")}${withUnit ? "원" : ""}`;
}

/** 달러. 예: 1234.5 → "$1,234.50" */
export function usd(x: number | null | undefined, digits = 2): string {
  if (x == null || !isFinite(x)) return "—";
  return `$${x.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

/** 큰 수 압축. 억 단위 입력을 조/억으로. 예: 4200000(억) → "420조" */
export function compactEok(eok: number | null | undefined): string {
  if (eok == null || !isFinite(eok)) return "—";
  if (eok >= 10000) return `${(eok / 10000).toFixed(1).replace(/\.0$/, "")}조`;
  return `${Math.round(eok).toLocaleString("ko-KR")}억`;
}

/** 일반 큰 수 압축 (K/M/B). */
export function compact(x: number | null | undefined): string {
  if (x == null || !isFinite(x)) return "—";
  return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(x);
}

/** 'YYYY-MM-DD' → 'YYYY.MM.DD' 표시용 */
export function ymd(date: string | null | undefined): string {
  if (!date) return "—";
  return date.replaceAll("-", ".");
}

/** ISO 시각 → 'YYYY.MM.DD HH:mm' (KST 기준 표시) */
export function stamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes()
  )}`;
}

/** 'MM-DD' → 'M월 D일' */
export function mmddKo(mmdd: string): string {
  const [m, d] = mmdd.split("-");
  return `${+m!}월 ${+d!}일`;
}

/** 손익 방향 색 토큰 클래스명 반환 */
export function dirClass(x: number): string {
  if (x > 0) return "text-up";
  if (x < 0) return "text-down";
  return "text-fg-dim";
}
