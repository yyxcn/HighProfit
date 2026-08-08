"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "@/lib/theme";
import { TvAttribution } from "@/components/common/TvAttribution";

/**
 * TradingView Advanced Chart 임베드 위젯 (실시간·분봉·풀 UI).
 * output:export 호환 — 클라이언트에서 컨테이너에 <script> 주입.
 * 심볼/테마 변경 시 위젯은 핫스왑 불가하므로 컨테이너를 비우고 재주입한다.
 */
export function TradingViewChart({ symbol }: { symbol: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const theme = useTheme((s) => s.theme);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    host.innerHTML = "";

    const container = document.createElement("div");
    container.className = "tradingview-widget-container";
    container.style.height = "100%";
    container.style.width = "100%";

    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "100%";
    widget.style.width = "100%";
    container.appendChild(widget);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.type = "text/javascript";
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval: "D",
      timezone: "Asia/Seoul",
      theme,
      style: "1", // 캔들
      locale: "kr",
      hide_side_toolbar: false,
      allow_symbol_change: true,
      calendar: false,
      support_host: "https://www.tradingview.com",
    });
    container.appendChild(script);
    host.appendChild(container);

    return () => {
      host.innerHTML = "";
    };
  }, [symbol, theme]);

  return (
    <div className="w-full h-full flex flex-col">
      <div ref={ref} className="flex-1 min-h-0" />
      <TvAttribution />
    </div>
  );
}
