"use client";

import { useEffect, useMemo, useState } from "react";
import { History, Plus, Trash2, Scale } from "lucide-react";
import {
  backtest,
  type Bar,
  type BacktestResult,
  type Rebalance,
  type UniverseItem,
} from "@highprofit/core";
import { getBars } from "@/lib/data";
import { useUniverse } from "@/lib/universe";
import { SecurityButton } from "@/components/common/SecurityButton";
import { StatCard } from "@/components/common/StatCard";
import { EmptyState } from "@/components/common/EmptyState";
import { EquityChart } from "@/components/backtest/EquityChart";
import { YearlyBars } from "@/components/backtest/YearlyBars";
import { pct, won, ymd } from "@/lib/format";
import { cn } from "@/lib/utils";

const THIS_YEAR = new Date().getFullYear();
const today = new Date().toISOString().slice(0, 10);
const yearsAgo = (n: number) => `${THIS_YEAR - n}-${today.slice(5)}`;

interface Row {
  item: UniverseItem;
  weight: number; // percent
}

const REBALANCE: { key: Rebalance; label: string }[] = [
  { key: "none", label: "없음" },
  { key: "monthly", label: "월" },
  { key: "quarterly", label: "분기" },
  { key: "yearly", label: "연" },
];

const BENCH: { key: string; label: string; m: "KR" | "US"; t: string }[] = [
  { key: "kospi", label: "KOSPI(KODEX200)", m: "KR", t: "069500" },
  { key: "sp500", label: "S&P500(SPY)", m: "US", t: "SPY" },
];

const barsCache = new Map<string, Bar[]>();
async function loadBars(m: "KR" | "US", t: string): Promise<Bar[]> {
  const key = `${m}:${t}`;
  if (barsCache.has(key)) return barsCache.get(key)!;
  const b = await getBars(m, t);
  barsCache.set(key, b);
  return b;
}

export default function BacktestPage() {
  const { items } = useUniverse();
  const [rows, setRows] = useState<Row[]>([]);
  const [initial, setInitial] = useState(10_000_000);
  const [rebalance, setRebalance] = useState<Rebalance>("yearly");
  const [benchKey, setBenchKey] = useState("kospi");
  const [costPct, setCostPct] = useState(0.2);
  const [from, setFrom] = useState(yearsAgo(10));
  const [to, setTo] = useState(today);

  const [result, setResult] = useState<BacktestResult | null>(null);
  const [status, setStatus] = useState<"idle" | "running" | "ok" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");

  const byTicker = useMemo(() => {
    const m = new Map<string, UniverseItem>();
    for (const it of items) m.set(`${it.m}:${it.t}`, it);
    return m;
  }, [items]);

  const weightSum = rows.reduce((a, r) => a + r.weight, 0);
  const weightOk = rows.length > 0 && Math.abs(weightSum - 100) < 0.1;

  const addAsset = (it: UniverseItem) => {
    if (rows.length >= 10 || rows.some((r) => r.item.t === it.t && r.item.m === it.m)) return;
    setRows((r) => [...r, { item: it, weight: 0 }]);
  };
  const equalize = () => {
    if (rows.length === 0) return;
    const w = Math.round((100 / rows.length) * 100) / 100;
    setRows((r) => r.map((x, i) => ({ ...x, weight: i === r.length - 1 ? 100 - w * (r.length - 1) : w })));
  };

  const applyPreset = (preset: "spy10" | "samsung10" | "6040" | "bigtech5") => {
    const resolve = (m: "KR" | "US", t: string) => byTicker.get(`${m}:${t}`);
    let next: Row[] = [];
    if (preset === "spy10") {
      const it = resolve("US", "SPY");
      if (it) next = [{ item: it, weight: 100 }];
      setFrom(yearsAgo(10)); setBenchKey("sp500");
    } else if (preset === "samsung10") {
      const it = resolve("KR", "005930");
      if (it) next = [{ item: it, weight: 100 }];
      setFrom(yearsAgo(10)); setBenchKey("kospi");
    } else if (preset === "6040") {
      const spy = resolve("US", "SPY"); const tlt = resolve("US", "TLT") ?? resolve("US", "QQQ");
      if (spy && tlt) next = [{ item: spy, weight: 60 }, { item: tlt, weight: 40 }];
      setFrom(yearsAgo(10)); setBenchKey("sp500");
    } else {
      const ts = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN"].map((t) => resolve("US", t)).filter(Boolean) as UniverseItem[];
      next = ts.map((it) => ({ item: it, weight: Math.round((100 / ts.length) * 100) / 100 }));
      if (next.length) next[next.length - 1]!.weight = 100 - next.slice(0, -1).reduce((a, r) => a + r.weight, 0);
      setFrom(yearsAgo(5)); setBenchKey("sp500");
    }
    setRows(next);
    setTo(today);
  };

  useEffect(() => {
    if (!weightOk) {
      setResult(null);
      setStatus("idle");
      return;
    }
    let alive = true;
    setStatus("running");
    (async () => {
      try {
        const assets = await Promise.all(
          rows.map(async (r) => ({
            ticker: r.item.t,
            weight: r.weight,
            bars: await loadBars(r.item.m, r.item.t),
          }))
        );
        const bdef = BENCH.find((b) => b.key === benchKey);
        const benchmark =
          bdef && benchKey !== "none"
            ? { ticker: bdef.t, bars: await loadBars(bdef.m, bdef.t) }
            : undefined;
        if (!alive) return;
        const res = backtest({
          assets,
          from,
          to,
          initialCapital: initial,
          rebalance,
          benchmark,
          costRate: costPct / 100,
        });
        setResult(res);
        setStatus("ok");
      } catch (e) {
        if (!alive) return;
        setErrMsg(e instanceof Error ? e.message : "계산 실패");
        setStatus("error");
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(rows.map((r) => [r.item.m, r.item.t, r.weight])), from, to, initial, rebalance, benchKey, costPct]);

  const benchLabel = BENCH.find((b) => b.key === benchKey)?.label;

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* 프리셋 */}
      <div className="flex flex-wrap gap-2">
        <PresetBtn onClick={() => applyPreset("spy10")}>10년 전 SPY에 1천만원</PresetBtn>
        <PresetBtn onClick={() => applyPreset("samsung10")}>삼성전자 10년</PresetBtn>
        <PresetBtn onClick={() => applyPreset("6040")}>SPY 60 / 채권 40</PresetBtn>
        <PresetBtn onClick={() => applyPreset("bigtech5")}>미국 빅테크 균등 5년</PresetBtn>
      </div>

      <div className="grid lg:grid-cols-[300px_1fr] gap-4">
        {/* 입력 패널 */}
        <div className="space-y-3">
          <div className="rounded-lg border border-line bg-surface p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-micro uppercase tracking-wide text-fg-mute">자산 (최대 10)</span>
              <button onClick={equalize} className="flex items-center gap-1 text-small text-fg-dim hover:text-fg">
                <Scale size={13} /> 균등분배
              </button>
            </div>
            {rows.map((r, i) => (
              <div key={`${r.item.m}:${r.item.t}`} className="flex items-center gap-2">
                <span className="num text-fg-dim text-small w-14 shrink-0">{r.item.t}</span>
                <span className="text-fg text-small flex-1 truncate">{r.item.n}</span>
                <input
                  type="number"
                  value={r.weight}
                  min={0}
                  max={100}
                  onChange={(e) =>
                    setRows((rs) => rs.map((x, j) => (j === i ? { ...x, weight: +e.target.value || 0 } : x)))
                  }
                  className="num w-14 bg-raised border border-line rounded px-1.5 py-0.5 text-small text-fg outline-none focus:border-accent"
                />
                <span className="text-fg-mute text-small">%</span>
                <button onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="text-fg-mute hover:text-down">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {rows.length < 10 && (
              <SecurityButton value={null} onSelect={addAsset} placeholder="자산 추가" />
            )}
            <div className={cn("text-small num", weightOk ? "text-fg-mute" : "text-accent")}>
              합계 {weightSum.toFixed(1)}% {weightOk ? "" : "(100% 필요)"}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-surface p-3 space-y-3">
            <Field label="초기자본">
              <input
                type="number"
                value={initial}
                onChange={(e) => setInitial(Math.max(1, +e.target.value || 0))}
                className="num w-full bg-raised border border-line rounded px-2 py-1 text-small text-fg outline-none focus:border-accent"
              />
            </Field>
            <Field label="기간">
              <div className="flex items-center gap-1.5">
                <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="num flex-1 bg-raised border border-line rounded px-2 py-1 text-small text-fg outline-none focus:border-accent" />
                <span className="text-fg-mute">~</span>
                <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className="num flex-1 bg-raised border border-line rounded px-2 py-1 text-small text-fg outline-none focus:border-accent" />
              </div>
              <div className="flex gap-1 mt-1.5">
                {[3, 5, 10].map((n) => (
                  <button key={n} onClick={() => { setFrom(yearsAgo(n)); setTo(today); }} className="num text-micro px-1.5 py-0.5 rounded bg-raised text-fg-dim hover:text-fg">
                    {n}Y
                  </button>
                ))}
                <button onClick={() => { setFrom("1990-01-01"); setTo(today); }} className="num text-micro px-1.5 py-0.5 rounded bg-raised text-fg-dim hover:text-fg">전체</button>
              </div>
            </Field>
            <Field label="리밸런싱">
              <div className="inline-flex rounded-md border border-line bg-raised p-0.5">
                {REBALANCE.map((rb) => (
                  <button key={rb.key} onClick={() => setRebalance(rb.key)} className={cn("text-small px-2 py-0.5 rounded", rebalance === rb.key ? "bg-line text-fg" : "text-fg-dim")}>
                    {rb.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="벤치마크">
              <div className="inline-flex flex-wrap gap-1">
                {[...BENCH, { key: "none", label: "없음" }].map((b) => (
                  <button key={b.key} onClick={() => setBenchKey(b.key)} className={cn("text-small px-2 py-0.5 rounded border", benchKey === b.key ? "border-accent text-fg" : "border-line text-fg-dim")}>
                    {b.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="거래비용 (왕복 %)">
              <input type="number" step={0.05} value={costPct} onChange={(e) => setCostPct(Math.max(0, +e.target.value || 0))} className="num w-full bg-raised border border-line rounded px-2 py-1 text-small text-fg outline-none focus:border-accent" />
            </Field>
          </div>
          <p className="text-micro text-fg-mute">
            미국 자산은 달러 기준(환율 미반영). 수정주가 사용으로 배당은 재투자 반영됨.
          </p>
        </div>

        {/* 결과 */}
        <div className="space-y-4 min-w-0">
          {rows.length === 0 && <EmptyState icon={History} title="프리셋을 누르거나 자산을 추가해 시작하세요." />}
          {status === "error" && <p className="text-fg-dim text-small">{errMsg}</p>}
          {status === "ok" && result && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <StatCard label="CAGR" value={pct(result.cagr)} tone={result.cagr >= 0 ? "up" : "down"} />
                <StatCard label="총수익률" value={pct(result.totalReturn)} sub={won(result.finalValue)} tone={result.totalReturn >= 0 ? "up" : "down"} />
                <StatCard label="MDD" value={pct(result.mdd)} tone="down" />
                <StatCard label="샤프" value={result.sharpe.toFixed(2)} />
                <StatCard label="소르티노" value={result.sortino.toFixed(2)} />
                <StatCard label="연변동성" value={pct(result.volatility)} sub={`칼마 ${result.calmar.toFixed(2)}`} />
              </div>

              <div className="rounded-lg border border-line bg-surface p-3">
                <div className="text-small text-fg-dim mb-1">자산곡선 <span className="text-fg-mute">(붉은 음영 = 최대낙폭 구간)</span></div>
                <div className="h-[300px]"><EquityChart result={result} benchLabel={benchLabel} /></div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-lg border border-line bg-surface p-3">
                  <div className="text-small text-fg-dim mb-1">연도별 수익률</div>
                  <div className="h-[180px]"><YearlyBars yearly={result.yearly} /></div>
                </div>
                <div className="rounded-lg border border-line bg-surface p-3">
                  <div className="text-small text-fg-dim mb-2">최대낙폭 구간 (상위 5)</div>
                  <DrawdownTable result={result} />
                </div>
              </div>
            </>
          )}
          <p className="text-micro text-fg-mute">과거 성과는 미래 수익을 보장하지 않습니다.</p>
        </div>
      </div>
    </div>
  );
}

function DrawdownTable({ result }: { result: BacktestResult }) {
  if (result.drawdowns.length === 0) return <p className="text-fg-mute text-small">낙폭 구간 없음</p>;
  return (
    <table className="w-full text-small num">
      <thead>
        <tr className="text-fg-mute text-micro">
          <th className="text-left font-normal pb-1">시작</th>
          <th className="text-left font-normal pb-1">저점</th>
          <th className="text-left font-normal pb-1">회복</th>
          <th className="text-right font-normal pb-1">깊이</th>
          <th className="text-right font-normal pb-1">회복일</th>
        </tr>
      </thead>
      <tbody>
        {result.drawdowns.map((d, i) => (
          <tr key={i} className="border-t border-line/60">
            <td className="py-1 text-fg-dim">{ymd(d.start)}</td>
            <td className="py-1 text-fg-dim">{ymd(d.trough)}</td>
            <td className="py-1 text-fg-dim">{d.end ? ymd(d.end) : "진행중"}</td>
            <td className="py-1 text-right text-down">{pct(d.depth)}</td>
            <td className="py-1 text-right text-fg-mute">{d.recoveryDays ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-micro uppercase tracking-wide text-fg-mute mb-1">{label}</div>
      {children}
    </div>
  );
}

function PresetBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="text-small px-3 py-1.5 rounded-md border border-line bg-surface hover:border-accent text-fg-dim hover:text-fg transition-colors">
      {children}
    </button>
  );
}
