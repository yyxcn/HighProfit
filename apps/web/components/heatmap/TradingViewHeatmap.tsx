"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "@/lib/theme";

/**
 * TradingView Stock Heatmap 임베드 위젯 (실시간).
 * dataSource 로 시장 지정. 위젯 상단바(hasTopBar+isDataSetEnabled)에서 사용자가
 * 다른 시장으로 전환도 가능(한국 등 TV 지원 범위 내).
 */
export function TradingViewHeatmap({ dataSource = "SPX500" }: { dataSource?: string }) {
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
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js";
    script.async = true;
    script.type = "text/javascript";
    script.innerHTML = JSON.stringify({
      dataSource,
      blockSize: "market_cap_basic",
      blockColor: "change",
      grouping: "sector",
      locale: "kr",
      symbolUrl: "",
      colorTheme: theme,
      hasTopBar: true,
      isDataSetEnabled: true,
      isZoomEnabled: true,
      hasSymbolTooltip: true,
      isMonoSize: false,
      width: "100%",
      height: "100%",
    });
    container.appendChild(script);
    host.appendChild(container);

    return () => {
      host.innerHTML = "";
    };
  }, [dataSource, theme]);

  return <div ref={ref} className="w-full h-full" />;
}
