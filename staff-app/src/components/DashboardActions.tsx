import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { ActionLevel, DashboardAction } from "../lib/dashboard-actions";
import { buttonClasses } from "./Button";
import { Pagination } from "./Pagination";

// "วันนี้ต้องทำอะไร" — แถวงานเรียงตามความเร่งด่วน กดแล้วไปหน้าที่ลงมือได้เลย
// สีบอกระดับ ไม่ได้บอกชนิดงาน: แดง = เสียโอกาสถ้าไม่ทำวันนี้, เขียว = จังหวะดีให้ปิดการขาย,
// เหลือง = ตามได้เรื่อย ๆ, เทา = งานตั้งค่าที่ค้างอยู่
const LEVEL_DOT: Record<DashboardAction["level"], string> = {
  urgent: "bg-red-500",
  opportunity: "bg-emerald-500",
  watch: "bg-amber-400",
  unknown: "bg-slate-400",
  calm: "bg-slate-300",
};

const LEVEL_TEXT: Record<DashboardAction["level"], string> = {
  urgent: "text-red-700",
  opportunity: "text-emerald-700",
  watch: "text-amber-700",
  unknown: "text-slate-600",
  calm: "text-slate-500",
};

// ชื่อชิปตัวกรอง — พูดว่า "ควรทำยังไง" ไม่ใช่ชื่อระดับทางเทคนิค
const LEVEL_LABEL: Record<ActionLevel, string> = {
  urgent: "เร่งด่วน",
  opportunity: "จังหวะดี",
  watch: "ตามได้เรื่อย ๆ",
  unknown: "ไม่รู้ผล",
  calm: "ยังไม่ต้องตาม",
};

/** ลำดับชิป = ลำดับความเร่ง ตัวเดียวกับที่ใช้เรียงแถว */
const LEVEL_CHIP_ORDER: ActionLevel[] = ["urgent", "opportunity", "watch", "unknown", "calm"];

const PAGE_SIZE = 8;

/** 8 แถว × ~3.5rem — ตรึงไว้เฉพาะตอนมีหลายหน้า ไม่งั้นการ์ดที่มี 3 งานจะเหลือที่ว่างเปล่า ๆ */
const EIGHT_ROWS = "min-h-[28rem]";

function money(value: number): string {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function ActionRow({ item, index }: Readonly<{ item: DashboardAction; index: number }>) {
  return (
    <Link
      to={item.href}
      className="flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-slate-50"
    >
      {/* เลขลำดับนับต่อเนื่องข้ามหน้า — บอกว่ายืนอยู่ตรงไหนของกอง และคุยกันรู้เรื่องว่า "อันที่ 23" */}
      <span className="mt-0.5 w-6 shrink-0 text-right text-xs tabular-nums text-slate-400">
        {index}.
      </span>
      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${LEVEL_DOT[item.level]}`} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-medium ${LEVEL_TEXT[item.level]}`}>{item.headline}</span>
        <span className="block text-xs text-slate-500">{item.action}</span>
      </span>
      {item.amount != null && item.amount > 0 && (
        <span className="shrink-0 text-sm tabular-nums text-slate-700">{money(item.amount)}</span>
      )}
      <ArrowRight size={14} className="mt-1 shrink-0 text-slate-300" aria-hidden />
    </Link>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: Readonly<{ label: string; count: number; active: boolean; onClick: () => void }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
        active
          ? "bg-slate-800 font-medium text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {label} <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}

export function DashboardActions({
  actions,
  pageSize = PAGE_SIZE,
}: Readonly<{ actions: DashboardAction[]; pageSize?: number }>) {
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionRef = useRef<HTMLElement>(null);

  // นับทุกระดับจากรายการเต็มเสมอ — ชิปต้องบอกรูปร่างของกองทั้งกอง ไม่ใช่ของที่กรองอยู่
  const counts = useMemo(() => {
    const map = new Map<ActionLevel, number>();
    for (const a of actions) map.set(a.level, (map.get(a.level) ?? 0) + 1);
    return map;
  }, [actions]);

  const levelParam = searchParams.get("level") as ActionLevel | null;
  const level = levelParam && counts.has(levelParam) ? levelParam : null;

  const filtered = useMemo(
    () => (level ? actions.filter((a) => a.level === level) : actions),
    [actions, level],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(Math.max(1, Number(searchParams.get("page")) || 1), pageCount);
  const start = (page - 1) * pageSize;
  const shown = filtered.slice(start, start + pageSize);

  /** เขียนหน้า/ตัวกรองลง URL — กดเข้าโครงการแล้วกดย้อนกลับ ต้องได้ที่เดิม ไม่ใช่เด้งกลับหน้า 1 */
  function setParams(next: { page?: number; level?: ActionLevel | null }) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next.level !== undefined) {
          if (next.level === null) params.delete("level");
          else params.set("level", next.level);
        }
        const nextPage = next.page ?? 1;
        if (nextPage <= 1) params.delete("page");
        else params.set("page", String(nextPage));
        return params;
      },
      { replace: true },
    );
  }

  function goPage(next: number) {
    setParams({ page: next });
    // เลื่อนกลับมาที่หัวการ์ดเฉพาะตอนที่มันหลุดขึ้นไปเหนือจอแล้ว — ไม่งั้นหน้าจะกระตุกทุกครั้งที่กด
    requestAnimationFrame(() => {
      const top = sectionRef.current?.getBoundingClientRect().top ?? 0;
      if (top < 0) window.scrollTo({ top: window.scrollY + top });
    });
  }

  // ลูกศรซ้าย-ขวาเลื่อนหน้า — หน้านี้พนักงานเปิดทุกเช้า
  // ข้ามไปถ้ากำลังพิมพ์อยู่ในช่องกรอก หรือกดร่วมกับปุ่มพิเศษ (Alt+← คือ "ย้อนกลับ" ของเบราว์เซอร์)
  useEffect(() => {
    if (pageCount <= 1) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const el = document.activeElement;
      if (el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === "ArrowLeft" && page > 1) goPage(page - 1);
      if (e.key === "ArrowRight" && page < pageCount) goPage(page + 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageCount]);

  const chips = LEVEL_CHIP_ORDER.filter((l) => (counts.get(l) ?? 0) > 0);

  return (
    <section ref={sectionRef} aria-labelledby="dash-actions" className="mb-8 scroll-mt-20">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="dash-actions" className="text-lg font-medium text-slate-800">
          ต้องทำวันนี้
        </h2>
        <p className="text-xs text-slate-500">
          {actions.length === 0 ? "ไม่มีงานค้าง" : `${actions.length} รายการ`}
        </p>
      </div>

      {actions.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
          <CheckCircle2 size={18} className="text-emerald-500" aria-hidden />
          ไม่มีงานค้างในตอนนี้ — ใบเสนอราคา สัญญา และงวดเงินตามทันหมดแล้ว
        </div>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {/* ไม่มีใครไล่ 12 หน้าเพื่อหาของเร่งด่วน — ชิปทำให้เหลือ 2 หน้า
              ขึ้นเฉพาะตอนมีมากกว่าหนึ่งระดับจริง ๆ ไม่งั้นเป็นแถบที่กดแล้วไม่เกิดอะไร */}
          {chips.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
              <FilterChip
                label="ทั้งหมด"
                count={actions.length}
                active={level === null}
                onClick={() => setParams({ level: null, page: 1 })}
              />
              {chips.map((l) => (
                <FilterChip
                  key={l}
                  label={LEVEL_LABEL[l]}
                  count={counts.get(l) ?? 0}
                  active={level === l}
                  onClick={() => setParams({ level: l, page: 1 })}
                />
              ))}
            </div>
          )}

          <div className={`divide-y divide-slate-100 ${pageCount > 1 ? EIGHT_ROWS : ""}`}>
            {shown.map((item, i) => (
              <ActionRow key={item.key} item={item} index={start + i + 1} />
            ))}
          </div>

          <Pagination page={page} pageCount={pageCount} onChange={goPage} className="px-3 py-2" />
        </div>
      )}

      {/* หน้างานค้างแยกเป็นหมวด ๆ พร้อมรายละเอียดที่การ์ดนี้ตัดทิ้ง (เหตุผลที่ปฏิเสธ, ประวัติการเปิดดู)
          เป็นปุ่ม ghost ไม่ใช่ลิงก์ขีดเส้นใต้ — แค่พาไปหน้าอื่น ไม่แตะข้อมูล (ดู components/Button.tsx)
          และเป็นแบบเดียวกับ "ดูแฟ้มลูกค้า" / "← กลับไปโครงการ" ที่ใช้อยู่ทั่วแอป */}
      {actions.length > 0 && (
        <div className="mt-2 flex justify-end">
          <Link to="/pending-work" className={buttonClasses("ghost", "sm")}>
            ดูแบบแยกหมวด <ArrowRight size={14} aria-hidden />
          </Link>
        </div>
      )}
    </section>
  );
}
