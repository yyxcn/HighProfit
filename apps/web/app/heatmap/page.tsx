"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CLAMP, heatColor, type Market, type Period, type SectorsFile } from "@highprofit/core";
import { getSectors } from "@/lib/data";
import { kvGet, kvSet } from "@/lib/db";
import { EmptyState } from "@/components/common/EmptyState";
import { Treemap } from "@/components/heatmap/Treemap";
import { TradingViewHeatmap } from "@/components/heatmap/TradingViewHeatmap";
import { pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Grid2x2 } from "lucide-react";

type Mode = "tv" | "basic";
const TV_SOURCES = [
  { key: "SPX500", label: "S&P500" },
  { key: "NASDAQ100", label: "나스닥100" },
  { key: "AllUSA", label: "전체 미국" },
];

const SCOPES: { key: string; label: string; scope: Market | "ETF" }[] = [
  { key: "kr", label: "한국", scope: "KR" },
  { key: "us", label: "미국", scope: "US" },
  { key: "etf", label: "ETF", scope: "ETF" },
];
const PERIODS: { key: Period; label: string }[] = [
  { key: "1d", label: "1일" },
  { key: "5d", label: "5일" },
  { key: "1m", label: "1개월" },
  { key: "3m", label: "3개월" },
  { key: "6m", label: "6개월" },
  { key: "1y", label: "1년" },
];

export default function HeatmapPage() {
  return (
    <Suspense fallback={<div className="p-6 text-fg-dim text-small">불러오는 중…</div>}>
      <HeatmapView />
    </Suspense>
  );
}

function HeatmapView() {
  const router = useRouter();
  const params = useSearchParams();
  const mKey = params.get("m") ?? "kr";
  const period = (params.get("p") as Period) ?? "1m";
  const scopeDef = SCOPES.find((s) => s.key === mKey) ?? SCOPES[0]!;

  const [file, setFile] = useState<SectorsFile | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [mode, setMode] = useState<Mode>("tv");
  const [tvSource, setTvSource] = useState("SPX500");

  useEffect(() => {
    kvGet<Mode>("heatmap.mode", "tv").then(setMode);
  }, []);

  useEffect(() => {
    if (mode !== "basic") return;
    setStatus("loading");
    getSectors(scopeDef.scope)
      .then((f) => {
        setFile(f);
        setStatus("ok");
      })
      .catch(() => setStatus("error"));
  }, [scopeDef.scope, mode]);

  const setQuery = (next: Partial<{ m: string; p: string }>) => {
    const sp = new URLSearchParams(params.toString());
    if (next.m) sp.set("m", next.m);
    if (next.p) sp.set("p", next.p);
    router.replace(`/heatmap?${sp.toString()}`);
  };
  const changeMode = (m: Mode) => {
    setMode(m);
    kvSet("heatmap.mode", m);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-line">
        {/* 실시간(TV) ↔ 기본 토글 */}
        <div className="inline-flex rounded-md border border-line bg-surface/60 p-0.5">
          <button
            onClick={() => changeMode("tv")}
            className={cn("text-small px-2.5 py-1 rounded transition-colors", mode === "tv" ? "bg-raised text-fg" : "text-fg-dim hover:text-fg")}
          >
            실시간(TV)
          </button>
          <button
            onClick={() => changeMode("basic")}
            className={cn("text-small px-2.5 py-1 rounded transition-colors", mode === "basic" ? "bg-raised text-fg" : "text-fg-dim hover:text-fg")}
          >
            기본
          </button>
        </div>

        {mode === "tv" ? (
          <Segment options={TV_SOURCES} value={tvSource} onChange={setTvSource} />
        ) : (
          <>
            <Segment options={SCOPES.map((s) => ({ key: s.key, label: s.label }))} value={mKey} onChange={(k) => setQuery({ m: k })} />
            <Segment options={PERIODS.map((p) => ({ key: p.key, label: p.label }))} value={period} onChange={(k) => setQuery({ p: k })} />
            <div className="ml-auto">
              <Legend period={period} />
            </div>
          </>
        )}
      </div>

      {mode === "tv" ? (
        <div className="flex-1 min-h-0">
          <TradingViewHeatmap dataSource={tvSource} />
        </div>
      ) : (
      <div className="flex-1 min-h-0 p-2">
        {status === "loading" && (
          <div className="h-full flex items-center justify-center text-fg-dim text-small animate-pulse">
            히트맵을 불러오는 중…
          </div>
        )}
        {status === "error" && (
          <EmptyState icon={Grid2x2} title="섹터 데이터를 불러오지 못했습니다. 파이프라인 실행 후 다시 시도하세요." />
        )}
        {status === "ok" && file && file.sectors.length > 0 && (
          <Treemap
            file={file}
            period={period}
            scope={scopeDef.scope}
            onSelect={(m, t) => router.push(`/chart?m=${m}&t=${t}`)}
          />
        )}
        {status === "ok" && file && file.sectors.length === 0 && (
          <EmptyState icon={Grid2x2} title="이 시장의 섹터 데이터가 아직 없습니다." />
        )}
      </div>
      )}
    </div>
  );
}

function Segment({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (k: string) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-line bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "text-small px-2.5 py-1 rounded transition-colors",
            value === o.key ? "bg-raised text-fg" : "text-fg-dim hover:text-fg"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Legend({ period }: { period: Period }) {
  const clamp = CLAMP[period];
  const stops = [-clamp, -clamp / 2, 0, clamp / 2, clamp];
  return (
    <div className="flex items-center gap-1.5">
      <span className="num text-micro text-fg-mute">{pct(-clamp, 0)}</span>
      <div className="flex h-3 rounded overflow-hidden border border-line">
        {stops.map((s, i) => (
          <span key={i} className="w-5 h-full block" style={{ background: heatColor(s, clamp) }} />
        ))}
      </div>
      <span className="num text-micro text-fg-mute">+{pct(clamp, 0, false)}</span>
    </div>
  );
}
