import type { CustomerChangeOrderDto, CustomerContractDto, PaymentAccountDto } from "@systemboq/shared-types";
import { ChevronDown, FileText } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "../lib/api";
import { useConfirm } from "../lib/confirm-context";
import { changeOrderViewerPath } from "../lib/document-pdf";
import { respondChangeOrder } from "../lib/my-api";

import { Collapsible } from "./Collapsible";

const money = (v: string | number) =>
  Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (v: string | null) => (v == null ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: 3 }));
const thaiDate = (iso: string) =>
  new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

/** ทิศของเงินต้องอ่านออกทันที: เพิ่ม = เครื่องหมายบวก · ลด = ลบสีแดง */
function signed(v: string | number): { text: string; cls: string } {
  const n = Number(v);
  if (n > 0) return { text: `+${money(n)}`, cls: "text-slate-900" };
  if (n < 0) return { text: `−${money(-n)}`, cls: "text-red-700" };
  return { text: money(0), cls: "text-slate-500" };
}

const KIND = { added: "เพิ่ม", removed: "ตัดออก", changed: "แก้" } as const;

const STATUS = {
  SENT: { label: "รอคุณอนุมัติ", cls: "bg-amber-100 text-amber-800" },
  APPROVED: { label: "อนุมัติแล้ว", cls: "bg-emerald-100 text-emerald-700" },
  REJECTED: { label: "ไม่อนุมัติ", cls: "bg-slate-100 text-slate-600" },
} as const;

/** รายการที่เปลี่ยน — มือถือเป็นแถวเรียงลงมา (ตารางหลายคอลัมน์อ่านไม่ไหวบนจอแคบ) */
function Lines({ co }: Readonly<{ co: CustomerChangeOrderDto }>) {
  return (
    <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm">
      {co.lines.map((l, i) => {
        const d = signed(l.delta);
        return (
          <li key={`${l.name}-${i}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2.5">
            <span className="w-12 shrink-0 text-xs font-medium text-slate-500">{KIND[l.kind]}</span>
            <span className="min-w-0 flex-1 text-slate-800">{l.name}</span>
            <span className={`tabular-nums font-medium ${d.cls}`}>{d.text}</span>
            <span className="basis-full pl-15 text-xs text-slate-500 tabular-nums">
              {l.beforeQty != null ? `เดิม ${qty(l.beforeQty)} ${l.unit} × ${money(l.beforeUnitPrice!)}` : "ไม่มีในสัญญาเดิม"}
              {" → "}
              {l.afterQty != null ? `ใหม่ ${qty(l.afterQty)} ${l.unit} × ${money(l.afterUnitPrice!)}` : "ตัดออก"}
            </span>
          </li>
        );
      })}
      {Number(co.adjustAmount) !== 0 && (
        <li className="flex items-baseline gap-3 px-3 py-2.5 text-slate-600">
          <span className="flex-1">ปรับส่วนลด / ปัดเศษ</span>
          <span className={`tabular-nums ${signed(co.adjustAmount).cls}`}>{signed(co.adjustAmount).text}</span>
        </li>
      )}
      {Number(co.vatAmount) !== 0 && (
        <li className="flex items-baseline gap-3 px-3 py-2.5 text-slate-600">
          <span className="flex-1">ภาษีมูลค่าเพิ่ม</span>
          <span className={`tabular-nums ${signed(co.vatAmount).cls}`}>{signed(co.vatAmount).text}</span>
        </li>
      )}
    </ul>
  );
}

function ChangeOrderCard({
  contractId,
  co,
  onResponded,
}: Readonly<{
  contractId: string;
  co: CustomerChangeOrderDto;
  onResponded: (res: { contracts: CustomerContractDto[]; payTo: PaymentAccountDto | null }) => void;
}>) {
  const confirm = useConfirm();
  const pending = co.status === "SENT";
  const [open, setOpen] = useState(pending);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  // ปุ่มไหนกำลังส่ง — บอกเป็นคำบนปุ่มนั้น (เดิมแค่จางลง ไม่รู้ว่ากำลังส่งหรือกดไม่ติด)
  const [busy, setBusy] = useState<"APPROVE" | "REJECT" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const total = signed(co.totalAmount);
  const status = STATUS[co.status as keyof typeof STATUS];

  async function respond(decision: "APPROVE" | "REJECT") {
    if (decision === "APPROVE") {
      const after = co.amountAfter ? ` มูลค่าสัญญาจะเป็น ${money(co.amountAfter)} บาท` : "";
      const ok = await confirm(`อนุมัติงานเพิ่ม-ลดตามใบ ${co.docNo}?${after}`, {
        confirmLabel: "อนุมัติ",
        variant: "success",
      });
      if (!ok) return;
    }
    setBusy(decision);
    setError(null);
    try {
      onResponded(await respondChangeOrder(contractId, co.id, { decision, note: decision === "REJECT" ? reason.trim() : null }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ส่งคำตอบไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`rounded-xl border p-4 ${pending ? "border-amber-300 bg-amber-50/40" : "border-slate-200 bg-white"}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status?.cls ?? ""}`}>{status?.label ?? co.status}</span>
        <span className="min-w-0 flex-1 font-medium text-slate-900">{co.title}</span>
        <span className={`text-base font-semibold tabular-nums ${total.cls}`}>{total.text}</span>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      <p className="mt-1 text-xs text-slate-500">
        {co.docNo} · ครั้งที่ {co.seq}
        {co.sentAt && ` · ส่งเมื่อ ${thaiDate(co.sentAt)}`}
        {co.extensionDays ? ` · ขยายเวลาก่อสร้าง ${co.extensionDays} วัน` : ""}
        {co.status === "APPROVED" && co.respondedAt && ` · อนุมัติเมื่อ ${thaiDate(co.respondedAt)}`}
        {co.status === "REJECTED" && co.responseNote && ` · เหตุผล: ${co.responseNote}`}
      </p>

      <Collapsible open={open}>
        {open && (
          <div>
            {co.note && <p className="mt-3 text-sm whitespace-pre-line text-slate-600">{co.note}</p>}
            <Lines co={co} />
            {co.amountBefore && co.amountAfter && (
              <p className="mt-2 text-right text-sm text-slate-600 tabular-nums">
                มูลค่าสัญญา {money(co.amountBefore)} → <span className="font-semibold text-slate-900">{money(co.amountAfter)}</span> บาท
              </p>
            )}
            {co.status === "APPROVED" && co.installmentChanges?.length ? (
              <p className="mt-1 text-right text-xs text-slate-500">
                {co.installmentChanges
                  .map((c) => (c.from == null ? `เพิ่มงวดที่ ${c.seq} ยอด ${money(c.to)}` : `งวดที่ ${c.seq} ${money(c.from)} → ${money(c.to)}`))
                  .join(" · ")}
              </p>
            ) : null}
            <div className="mt-3">
              <Link
                to={changeOrderViewerPath(contractId, co.id)}
                target="_blank"
                rel="noopener"
                className="link-pill -ml-2.5 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand lg:min-h-0"
              >
                <FileText size={15} aria-hidden /> เปิดใบงานเพิ่ม-ลด (PDF)
              </Link>
            </div>
          </div>
        )}
      </Collapsible>

      {pending && !rejecting && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:gap-3">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => respond("APPROVE")}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-emerald-600 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy === "APPROVE" ? "กำลังอนุมัติ..." : "อนุมัติงานเพิ่ม-ลด"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => setRejecting(true)}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
          >
            ไม่อนุมัติ
          </button>
        </div>
      )}

      {pending && rejecting && (
        <div className="mt-4 flex flex-col gap-2">
          <label htmlFor={`reject-${co.id}`} className="text-sm font-medium text-slate-700">
            บอกทีมงานว่าติดตรงไหน
          </label>
          <textarea
            id={`reject-${co.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="เช่น ราคาสูงกว่าที่คุยไว้ ขอเปลี่ยนเป็นวัสดุรุ่นอื่น"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
            <button
              type="button"
              disabled={busy !== null || !reason.trim()}
              onClick={() => respond("REJECT")}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-slate-800 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-900 disabled:opacity-50"
            >
              {busy === "REJECT" ? "กำลังส่ง..." : "ส่งเหตุผลและไม่อนุมัติ"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => setRejecting(false)}
              className="inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              กลับ
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

/**
 * งานเพิ่ม-ลดใต้สัญญาที่ลงนามแล้ว — ใบที่รอคำตอบเปิดกางไว้พร้อมปุ่ม ใบที่ปิดแล้วพับไว้
 * มูลค่าสัญญาปัจจุบันขึ้นหัวส่วนเมื่อต่างจากที่ลงนาม เพื่อไม่ให้ลูกค้าสับสนกับยอดในสัญญา PDF
 */
export function ChangeOrdersSection({
  contract,
  onResponded,
}: Readonly<{
  contract: CustomerContractDto;
  onResponded: (res: { contracts: CustomerContractDto[]; payTo: PaymentAccountDto | null }) => void;
}>) {
  if (contract.changeOrders.length === 0) return null;
  const changed = contract.contractAmount != null && contract.currentAmount !== contract.contractAmount;
  // ใบที่รอคำตอบขึ้นก่อน แล้วใหม่ไปเก่า
  const list = [...contract.changeOrders].sort(
    (a, b) => Number(b.status === "SENT") - Number(a.status === "SENT") || b.seq - a.seq,
  );
  return (
    <section className="mt-4" aria-label="งานเพิ่ม-ลด">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">งานเพิ่ม-ลด</h3>
        {changed && (
          <p className="text-xs text-slate-500 tabular-nums">
            ตามสัญญา {money(contract.contractAmount!)} → ปัจจุบัน{" "}
            <span className="font-semibold text-slate-800">{money(contract.currentAmount!)}</span> บาท
          </p>
        )}
      </div>
      <div className="flex flex-col gap-3">
        {list.map((co) => (
          <ChangeOrderCard key={co.id} contractId={contract.id} co={co} onResponded={onResponded} />
        ))}
      </div>
    </section>
  );
}
