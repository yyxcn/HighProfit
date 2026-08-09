"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Landmark, AlertTriangle, Star } from "lucide-react";
import {
  getFundsIndex,
  getFundPerformance,
  getFundPopular,
  type FundIndex,
  type FundPerformanceFile,
  type FundPopularFile,
} from "@/lib/data";
import { kvGet, kvSet } from "@/lib/db";
import { EmptyState } from "@/components/common/EmptyState";
import { FundTable } from "@/components/funds/FundTable";
import { FundDetail } from "@/components/funds/FundDetail";
import { PopularStocks } from "@/components/funds/PopularStocks";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "watch", label: "관심" },
  { key: "detail", label: "펀드 상세" },
  { key: "popular", label: "인기 주식" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const WATCH_KEY = "funds.watch";

export default function FundsPage() {
  return (
    <Suspense fallback={<div className="p-4 md:p-6 text-small text-fg-mute">불러오는 중…</div>}>
      <FundsInner />
    </Suspense>
  );
}

function FundsInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const tab = (TABS.find((t) => t.key === sp.get("tab"))?.key ?? "overview") as Tab;

  const [index, setIndex] = useState<FundIndex | null>(null);
  const [perf, setPerf] = useState<FundPerformanceFile | null>(null);
  const [popular, setPopular] = useState<FundPopularFile | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [watch, setWatch] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    getFundsIndex()
      .then((idx) => {
        setIndex(idx);
        setStatus("ok");
        setSel((cur) => cur ?? idx.funds[0]?.file ?? null);
      })
      .catch(() => setStatus("error"));
    // 성과·인기 집계는 별도 산출물 — 없으면 해당 탭만 안내를 띄운다
    getFundPerformance().then(setPerf).catch(() => setPerf(null));
    getFundPopular().then(setPopular).catch(() => setPopular(null));
    kvGet<string[]>(WATCH_KEY, []).then((v) => setWatch(new Set(v)));
  }, []);

  const setTab = useCallback(
    (t: Tab) => {
      const next = new URLSearchParams(sp.toString());
      next.set("tab", t);
      router.replace(`/funds?${next.toString()}`, { scroll: false });
    },
    [router, sp]
  );

  const toggleWatch = useCallback((cik: string) => {
    setWatch((prev) => {
      const next = new Set(prev);
      if (next.has(cik)) next.delete(cik);
      else next.add(cik);
      void kvSet(WATCH_KEY, [...next]);
      return next;
    });
  }, []);

  /** Overview·관심에서 펀드를 고르면 상세 탭으로 넘긴다. */
  const openDetail = useCallback(
    (cik: string) => {
      const entry = index?.funds.find((f) => f.cik === cik);
      if (entry) setSel(entry.file);
      setTab("detail");
    },
    [index, setTab]
  );

  const watched = useMemo(
    () => (perf ? perf.funds.filter((f) => watch.has(f.cik)) : []),
    [perf, watch]
  );

  const perfByCik = useMemo(
    () => new Map((perf?.funds ?? []).map((f) => [f.cik, f])),
    [perf]
  );

  // 상세 탭도 Overview 와 같은 집합을 보여준다 — 공시가 끊긴 펀드는 performance 에서 빠져 있다.
  const detailFunds = useMemo(() => {
    const all = index?.funds ?? [];
    if (!perf) return all;
    const live = new Set(perf.funds.map((f) => f.cik));
    return all.filter((f) => live.has(f.cik));
  }, [index, perf]);

  if (status === "error") {
    return (
      <div className="p-4 md:p-6">
        <EmptyState
          icon={Landmark}
          title="펀드 데이터를 불러오지 못했습니다. 분기 파이프라인 실행 후 다시 시도하세요."
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="font-display text-h1 text-fg">Guru Funds</h1>
        <p className="text-small text-fg-dim mt-0.5">
          13F 보고 헤지펀드 long equity 포지션 기반 추정 성과
        </p>
      </div>

      <div className="inline-flex rounded-md border border-line bg-surface p-0.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "text-small px-3 py-1.5 rounded transition-colors",
              tab === t.key ? "bg-raised text-fg font-semibold" : "text-fg-dim hover:text-fg"
            )}
          >
            {t.label}
            {t.key === "watch" && watch.size > 0 && (
              <span className="num ml-1.5 text-micro text-accent">{watch.size}</span>
            )}
          </button>
        ))}
      </div>

      {/* 한계 고지 (명세 6-5) */}
      <div className="flex items-start gap-2 rounded-lg border border-accent-dim/50 bg-accent-dim/10 px-3 py-2 text-small text-fg-dim">
        <AlertTriangle size={15} className="text-accent shrink-0 mt-0.5" />
        <p>
          13F는 <b className="text-fg">45일 지연 공시</b>이며{" "}
          <b className="text-fg">롱온리</b>(공매도·옵션숏·현금·채권·해외주식 제외)입니다.
          {(tab === "overview" || tab === "watch") && (
            <>
              {" "}
              성과는 <b className="text-fg">공시일 기준으로 분기마다 리밸런싱했다고 가정한 추정치</b>로,
              펀드의 실제 수익률이 아닙니다.
            </>
          )}{" "}
          실시간 추종용이 아니라 <b className="text-fg">참고용</b>입니다.
        </p>
      </div>

      {tab === "overview" &&
        (perf ? (
          <FundTable funds={perf.funds} watch={watch} onToggleWatch={toggleWatch} onSelect={openDetail} />
        ) : (
          <StatsMissing />
        ))}

      {tab === "watch" &&
        (!perf ? (
          <StatsMissing />
        ) : watched.length === 0 ? (
          <EmptyState
            icon={Star}
            title="관심 펀드가 없습니다. Overview 표나 펀드 상세에서 별을 눌러 추가하세요."
          />
        ) : (
          <FundTable funds={watched} watch={watch} onToggleWatch={toggleWatch} onSelect={openDetail} />
        ))}

      {tab === "detail" && (
        <FundDetail
          funds={detailFunds}
          watch={watch}
          onToggleWatch={toggleWatch}
          perfByCik={perfByCik}
          // 처음 고른 펀드가 필터에 걸려 사라졌으면 목록 첫 항목으로 대체한다
          file={detailFunds.some((f) => f.file === sel) ? sel : detailFunds[0]?.file ?? null}
          onSelect={setSel}
        />
      )}

      {tab === "popular" && (popular ? <PopularStocks file={popular} /> : <StatsMissing />)}
    </div>
  );
}

function StatsMissing() {
  return (
    <EmptyState
      icon={Landmark}
      title="집계 데이터가 아직 없습니다. pipeline.quarterly.build_fund_stats 를 실행하세요."
    />
  );
}
