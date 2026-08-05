import {
  CandlestickChart,
  Grid2x2,
  CalendarRange,
  History,
  Landmark,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  blurb: string;
}

export const NAV: NavItem[] = [
  { href: "/chart", label: "차트", icon: CandlestickChart, blurb: "캔들과 이평선" },
  { href: "/heatmap", label: "히트맵", icon: Grid2x2, blurb: "섹터별 온도" },
  { href: "/seasonality", label: "계절성", icon: CalendarRange, blurb: "10년 평균경로" },
  { href: "/backtest", label: "백테스팅", icon: History, blurb: "포트폴리오 성과검증" },
  { href: "/funds", label: "펀드", icon: Landmark, blurb: "13F 공시 비중" },
];

export function tabTitle(pathname: string): string {
  const item = NAV.find((n) => pathname.startsWith(n.href));
  return item?.label ?? "홈";
}
