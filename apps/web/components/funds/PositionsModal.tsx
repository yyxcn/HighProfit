"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { FundHolding } from "@/lib/data";
import { Modal } from "@/components/common/Modal";
import { PositionRow, PositionHead } from "@/components/funds/PositionRow";
import { pct } from "@/lib/format";

/**
 * 펀드의 **전체** 보유 종목 목록. 상세 화면 표는 상위 30 만 보여주므로 나머지는 여기서 본다.
 *
 * 13F 는 종목 수가 극단적으로 넓다(17개 ~ 7,600개) — 전부 한 번에 그리면 DOM 이 버틴다는 보장이
 * 없어서, 스크롤이 바닥에 닿을 때마다 한 페이지씩 늘린다. 검색은 티커·종목명 부분일치.
 */
const PAGE = 100;

export function PositionsModal({
  holding,
  open,
  onClose,
}: {
  holding: FundHolding;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return holding.positions;
    return holding.positions.filter(
      (p) =>
        p.ticker?.toLowerCase().includes(needle) || p.name.toLowerCase().includes(needle)
    );
  }, [holding, q]);

  const shown = filtered.slice(0, limit);
  const hasMore = filtered.length > shown.length;

  // 바닥 감시자가 화면에 들어오면 다음 페이지. root 를 두지 않아도 창 안 스크롤로 실제로
  // 보이게 됐을 때만 발동한다(조상 overflow 클리핑이 교차 계산에 반영되므로).
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!open || !el || !hasMore) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setLimit((l) => l + PAGE);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [open, hasMore, limit]);

  const close = () => {
    onClose();
    // 다음에 열 때 처음부터 — 닫히는 애니메이션 중에 목록이 튀지 않게 살짝 미룬다.
    setTimeout(() => {
      setQ("");
      setLimit(PAGE);
    }, 200);
  };

  const changeQuery = (v: string) => {
    setQ(v);
    setLimit(PAGE); // 검색이 바뀌면 다시 첫 페이지부터
  };

  return (
    <Modal
      open={open}
      onClose={close}
      className="max-w-[720px]"
      title={`${holding.name} — 보유 종목`}
      subtitle={
        <span className="num">
          {holding.quarter} · 전체 {holding.positions.length}종목
          {q && ` · 검색 ${filtered.length}건`}
        </span>
      }
    >
      <div className="relative mb-2">
        <Search
          size={14}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-mute"
        />
        <input
          value={q}
          onChange={(e) => changeQuery(e.target.value)}
          placeholder="티커 · 종목명 검색"
          className="w-full rounded-md border border-line bg-raised/40 py-1.5 pl-8 pr-2.5 text-small text-fg placeholder:text-fg-mute focus:border-accent focus:outline-none"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-small text-fg-mute">검색 결과가 없습니다.</p>
      ) : (
        <>
          <table className="w-full text-small num">
            <PositionHead />
            <tbody>
              {shown.map((p) => (
                <PositionRow
                  key={p.cusip}
                  p={p}
                  onClick={() => {
                    if (!p.ticker) return;
                    close();
                    router.push(`/chart?m=US&t=${p.ticker}`);
                  }}
                />
              ))}
            </tbody>
          </table>
          <div ref={sentinelRef} className="h-6" />
          {hasMore && (
            <p className="pb-1 text-center text-micro text-fg-mute num">
              {shown.length} / {filtered.length} — 스크롤하면 더 불러옵니다
            </p>
          )}
        </>
      )}

      <p className="mt-2 border-t border-line/60 pt-2 text-micro text-fg-mute">
        비중 합계 {pct(holding.positions.reduce((a, p) => a + p.weight, 0), 1, false)} · 13F 롱온리
        보고분이라 공매도·옵션·현금·채권은 빠져 있습니다.
      </p>
    </Modal>
  );
}
