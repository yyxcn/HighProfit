/**
 * SVG `<text>` 는 CSS 말줄임이 없어서 글자 폭을 직접 재야 타일 밖으로 안 넘친다.
 * 캔버스 컨텍스트 하나를 모듈 전역에 재사용하고, 폰트 스택은 실제 DOM 에서 읽어 온다
 * (하드코딩하면 폴백 폰트로 재서 어긋난다).
 * 트리맵류(섹터 히트맵·펀드 보유종목 히트맵)가 공유한다.
 */
let measureCtx: CanvasRenderingContext2D | null | undefined;
let sansFont = "";
let monoFont = "";

export function measure(text: string, fs: number, weight: number, mono = false): number {
  if (measureCtx === undefined) measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * fs * 0.6; // 캔버스를 못 쓰면 대략치로
  if (!sansFont) {
    sansFont = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
    monoFont =
      getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim() ||
      "ui-monospace, monospace";
  }
  measureCtx.font = `${weight} ${fs}px ${mono ? monoFont : sansFont}`;
  return measureCtx.measureText(text).width;
}

/**
 * `maxW` 안에 들어가는 (문구, 폰트크기) 를 찾는다.
 * 먼저 폰트를 `minFs` 까지 줄여 통째로 맞춰 보고, 그래도 넘치면 … 로 자른다.
 * 두 글자도 못 넣으면 null — 호출부가 더 짧은 대안으로 폴백하거나 문구를 뺀다.
 */
export function fitText(
  text: string,
  maxW: number,
  fs: number,
  minFs: number,
  weight = 700,
  mono = false,
): { text: string; fs: number } | null {
  if (maxW <= 0 || !text) return null;
  for (let s = Math.round(fs); s >= minFs; s--) {
    if (measure(text, s, weight, mono) <= maxW) return { text, fs: s };
  }
  const chars = [...text];
  for (let n = chars.length - 1; n >= 2; n--) {
    const cut = chars.slice(0, n).join("") + "…";
    if (measure(cut, minFs, weight, mono) <= maxW) return { text: cut, fs: minFs };
  }
  return null;
}
