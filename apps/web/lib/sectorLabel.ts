/**
 * GICS 섹터 영문명 → 좁은 칸에 들어가는 한글 라벨.
 * 데이터(`universe.json` 의 `s`, `sectors/*.json` 의 `name`)는 영문 그대로 두고 표시할 때만 바꾼다
 * — 파이프라인 산출물을 한글로 바꾸면 매핑이 두 군데로 갈라진다.
 * `Trading--Miscellaneous` 는 SIC 잔여 코드가 섞여 들어온 것, `기타` 는 yfinance 가 섹터를 못 준 종목.
 */
const LABEL: Record<string, string> = {
  "Information Technology": "IT",
  Financials: "금융",
  Industrials: "산업재",
  "Consumer Discretionary": "경기소비재",
  "Health Care": "헬스케어",
  "Communication Services": "커뮤니케이션",
  "Consumer Staples": "필수소비재",
  Energy: "에너지",
  Materials: "소재",
  "Real Estate": "부동산",
  Utilities: "유틸리티",
  "Trading--Miscellaneous": "트레이딩",
};

export function sectorLabel(name: string): string {
  return LABEL[name] ?? name;
}
