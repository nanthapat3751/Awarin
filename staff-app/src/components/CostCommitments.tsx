import type {
  CostOverrunDto,
  ProjectCommitmentDto,
  ProjectCostDto,
  ProjectCostReportDto,
} from "@systemboq/shared-types";
import { COST_OVERRUN_REASON_LABELS, COST_TYPE_LABELS, costValue } from "@systemboq/shared-types";
import { CircleCheck, FileWarning, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";

import { iconButtonClasses } from "./Button";
import { changeOrderLabel, INPUT, money } from "../lib/cost-entry";
import { Pagination } from "./Pagination";
import { Tooltip } from "./Tooltip";

function thaiDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

const categoryText = (row: { categoryId: string | null; categoryCode: string | null; categoryName: string | null }) =>
  row.categoryId ? `${row.categoryCode ?? ""} ${row.categoryName ?? ""}`.trim() : "ค่าดำเนินการ/ทั่วไป";

/** ป้ายใต้ชื่อรายการ: เกินงบเพราะอะไร · รอออก VO / ผูกใบไหน / ไม่เก็บเงินลูกค้า */
export function OverrunChips({ overrun }: Readonly<{ overrun: CostOverrunDto | null }>) {
  if (!overrun) return null;
  const chip = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] leading-4";
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      <span className={`${chip} bg-slate-100 text-slate-600`} title={overrun.note ?? undefined}>
        เกินงบ · {COST_OVERRUN_REASON_LABELS[overrun.reason]}
      </span>
      {overrun.voPending && <span className={`${chip} bg-amber-100 font-medium text-amber-800`}>รอออก VO</span>}
      {overrun.changeOrder && !overrun.voPending && (
        <span className={`${chip} bg-brand/10 text-brand`}>{overrun.changeOrder.docNo}</span>
      )}
      {overrun.voWaived && <span className={`${chip} bg-slate-100 text-slate-600`}>ไม่เก็บเงินลูกค้า</span>}
    </span>
  );
}

type VoTarget = { kind: "cost" | "commitment"; id: string };

/**
 * ค่าใช้จ่ายที่ลูกค้าขอเพิ่ม/เปลี่ยน แต่ยังไม่มีใบงานเพิ่ม-ลดเก็บเงิน — รูรั่วที่ใหญ่ที่สุดของงานรับเหมา
 * ผูกใบที่ออกแล้วได้จากตรงนี้ · ไม่เก็บเงินลูกค้า (บริษัทรับเอง) เฉพาะเจ้าของ
 */
export function VoPendingCard({
  report,
  isOwner,
  busy,
  onLink,
  onWaive,
  onGoToContract,
}: Readonly<{
  report: ProjectCostReportDto;
  isOwner: boolean;
  busy: boolean;
  onLink: (target: VoTarget, changeOrderId: string) => void;
  onWaive: (target: VoTarget, label: string) => void;
  onGoToContract?: () => void;
}>) {
  if (report.voPending.count === 0) return null;
  const items: { target: VoTarget; date: string; description: string; vendor: string | null; amount: number; noun: string }[] = [
    ...report.commitments
      .filter((c) => c.overrun?.voPending)
      .map((c) => ({
        target: { kind: "commitment" as const, id: c.id },
        date: c.committedOn,
        description: c.description,
        vendor: c.vendor,
        amount: costValue({ amount: Number(c.amount), vatAmount: Number(c.vatAmount) }, report.vatClaimable),
        noun: "ยอดที่สั่ง",
      })),
    ...report.costs
      .filter((c) => c.overrun?.voPending)
      .map((c) => ({
        target: { kind: "cost" as const, id: c.id },
        date: c.spentOn,
        description: c.description,
        vendor: c.vendor,
        amount: costValue({ amount: Number(c.amount), vatAmount: Number(c.vatAmount) }, report.vatClaimable),
        noun: "บิล",
      })),
  ];

  return (
    <section aria-labelledby="vo-pending" className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 gap-2.5">
          <FileWarning size={18} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
          <div className="min-w-0">
            <h3 id="vo-pending" className="text-sm font-semibold text-amber-900">
              รอออกใบงานเพิ่ม-ลด {report.voPending.count} รายการ · ต้นทุน{" "}
              <span className="tabular-nums">{money(report.voPending.amount)}</span> บาท
            </h3>
            <p className="text-xs text-amber-800">
              ค่าใช้จ่ายจากที่ลูกค้าขอเพิ่ม/เปลี่ยน ยังไม่ได้เก็บเงินลูกค้า — ถ้าไม่ออกใบงานเพิ่ม-ลด บริษัทจ่ายส่วนนี้เอง
            </p>
          </div>
        </div>
        {onGoToContract && (
          <button
            type="button"
            onClick={onGoToContract}
            className="link-pill -mr-2.5 shrink-0 text-sm font-medium text-amber-900 hover:bg-amber-100"
          >
            ไปออกใบงานเพิ่ม-ลด →
          </button>
        )}
      </div>
      <ul className="mt-3 divide-y divide-amber-200/70 rounded-md border border-amber-200/70 bg-white/70">
        {items.map((it) => (
          <li key={`${it.target.kind}-${it.target.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="text-slate-800">
                <span className="mr-1.5 text-xs text-slate-500">{it.noun}</span>
                {it.description}
              </p>
              <p className="text-xs text-slate-500">
                {thaiDate(it.date)}
                {it.vendor ? ` · ${it.vendor}` : ""}
              </p>
            </div>
            <span className="tabular-nums text-slate-800">{money(it.amount)}</span>
            <span className="flex flex-wrap items-center gap-2">
              {report.changeOrders.length > 0 && (
                <select
                  className={`${INPUT} max-w-64 py-1 text-xs`}
                  value=""
                  disabled={busy}
                  aria-label={`ผูก ${it.description} กับใบงานเพิ่ม-ลด`}
                  onChange={(e) => e.target.value && onLink(it.target, e.target.value)}
                >
                  <option value="">ผูกกับใบงานเพิ่ม-ลด…</option>
                  {report.changeOrders.map((co) => (
                    <option key={co.id} value={co.id}>
                      {changeOrderLabel(co)}
                    </option>
                  ))}
                </select>
              )}
              {isOwner && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onWaive(it.target, it.description)}
                  className="link-pill text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-800 disabled:bg-transparent disabled:opacity-50"
                >
                  ไม่เก็บเงินลูกค้า
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const PAGE_SIZE = 15;

/**
 * สั่งแล้ว ยังไม่จ่าย — ยอดผูกพันที่นับเข้างบไว้ก่อน · จ่ายจริงกด "จ่ายบิล" ย้ายจากคงค้างไปเป็นใช้จริง
 * ปิดยอด = ไม่มีบิลตามมาอีก (ส่วนที่ยังไม่จ่ายเลิกนับ) · ลบได้เฉพาะยอดที่ยังไม่มีบิลผูก
 */
export function CommitmentsSection({
  report,
  busy,
  canModify,
  onPay,
  onEdit,
  onToggleStatus,
  onDelete,
}: Readonly<{
  report: ProjectCostReportDto;
  busy: boolean;
  canModify: (row: { recordedById: string | null }) => boolean;
  onPay: (c: ProjectCommitmentDto) => void;
  onEdit: (c: ProjectCommitmentDto) => void;
  onToggleStatus: (c: ProjectCommitmentDto) => void;
  onDelete: (c: ProjectCommitmentDto) => void;
}>) {
  const [showClosed, setShowClosed] = useState(false);
  const [page, setPage] = useState(1);
  const all = report.commitments;
  if (all.length === 0) return null;
  const closedCount = all.filter((c) => c.status === "CLOSED").length;
  const rows = showClosed ? all : all.filter((c) => c.status === "OPEN");
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const paged = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <section className="flex flex-col gap-2" aria-labelledby="cost-commitments">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="cost-commitments" className="text-sm font-medium text-slate-800">
          สั่งแล้ว ยังไม่จ่าย{" "}
          <span className="font-normal text-slate-500">
            คงค้างรวม <span className="tabular-nums">{money(report.totals.committed)}</span> บาท
          </span>
        </h3>
        {closedCount > 0 && (
          <button
            type="button"
            onClick={() => {
              setShowClosed((v) => !v);
              setPage(1);
            }}
            className="link-pill -mr-2.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            {showClosed ? "ซ่อนที่ปิดยอดแล้ว" : `แสดงที่ปิดยอดแล้ว (${closedCount})`}
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
          ไม่มียอดที่ค้างจ่าย — ทุกยอดปิดแล้ว
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[50rem] text-sm">
            <thead className="text-left text-xs font-medium text-slate-600 [&_th]:border-b [&_th]:border-slate-300 [&_th]:bg-slate-200">
              <tr>
                <th className="px-3 py-2">วันที่สั่ง</th>
                <th className="px-3 py-2">รายการ</th>
                <th className="px-3 py-2">หมวด</th>
                <th className="px-3 py-2 text-right">ยอดที่สั่ง</th>
                <th className="px-3 py-2 text-right">จ่ายแล้ว</th>
                <th className="px-3 py-2 text-right">คงค้าง</th>
                <th className="w-40 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {paged.map((c) => {
                const closed = c.status === "CLOSED";
                const total = Number(c.amount) + (report.vatClaimable ? 0 : Number(c.vatAmount));
                return (
                  <tr key={c.id} className={`group border-t border-slate-100 align-top hover:bg-slate-50/70 ${closed ? "text-slate-400" : ""}`}>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">{thaiDate(c.committedOn)}</td>
                    <td className="px-3 py-2">
                      <span className={closed ? "text-slate-500" : "text-slate-800"}>{c.description}</span>
                      {(c.vendor || c.reference) && (
                        <span className="block text-xs text-slate-500">
                          {[c.vendor, c.reference ? `เลขที่ ${c.reference}` : null].filter(Boolean).join(" · ")}
                        </span>
                      )}
                      <span className="block text-xs text-slate-400">{COST_TYPE_LABELS[c.costType]}</span>
                      <OverrunChips overrun={c.overrun} />
                    </td>
                    <td className="px-3 py-2 text-slate-600">{categoryText(c)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{money(total)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                      {c.paid > 0 ? money(c.paid) : "—"}
                      {c.billCount > 0 && <span className="block text-xs text-slate-400">{c.billCount} บิล</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {closed ? (
                        <span className="text-xs text-slate-400">ปิดยอดแล้ว</span>
                      ) : (
                        <span className="font-medium text-slate-900">{money(c.remaining)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex items-center justify-end gap-0.5">
                        {!closed && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onPay(c)}
                            className="link-pill mr-1 whitespace-nowrap text-xs font-medium text-brand disabled:bg-transparent disabled:opacity-50"
                          >
                            จ่ายบิล
                          </button>
                        )}
                        {canModify(c) && (
                          <span className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 touch:opacity-100">
                            {/* ป้ายขึ้นด้านบน — ตารางห่อด้วย overflow-x-auto ป้ายใต้แถวสุดท้ายจะถูกตัด */}
                            <Tooltip label="แก้ไข" side="top">
                              <button
                                type="button"
                                aria-label={`แก้ไข ${c.description}`}
                                disabled={busy}
                                onClick={() => onEdit(c)}
                                className={iconButtonClasses()}
                              >
                                <Pencil size={14} />
                              </button>
                            </Tooltip>
                            <Tooltip label={closed ? "เปิดยอดอีกครั้ง" : "ปิดยอด (ไม่มีบิลตามมาอีก)"} side="top">
                              <button
                                type="button"
                                aria-label={closed ? `เปิดยอด ${c.description} อีกครั้ง` : `ปิดยอด ${c.description}`}
                                disabled={busy}
                                onClick={() => onToggleStatus(c)}
                                className={iconButtonClasses()}
                              >
                                {closed ? <RotateCcw size={14} /> : <CircleCheck size={14} />}
                              </button>
                            </Tooltip>
                            <Tooltip label={c.billCount > 0 ? "มีบิลผูกอยู่ ลบไม่ได้ — ใช้ปิดยอดแทน" : "ลบ"} side="top" align="end">
                              <button
                                type="button"
                                aria-label={`ลบ ${c.description}`}
                                disabled={busy || c.billCount > 0}
                                onClick={() => onDelete(c)}
                                className={iconButtonClasses("danger")}
                              >
                                <Trash2 size={14} />
                              </button>
                            </Tooltip>
                          </span>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={current} pageCount={pageCount} onChange={setPage} className="mt-1" />
    </section>
  );
}

/** ใต้ชื่อบิลในตารางบิล: จ่ายตามยอดที่สั่งไหน + ป้ายเกินงบ */
export function CostRowExtras({ cost }: Readonly<{ cost: ProjectCostDto }>) {
  return (
    <>
      {cost.commitmentLabel && <span className="block text-xs text-slate-500">จ่ายตามยอดที่สั่ง: {cost.commitmentLabel}</span>}
      <OverrunChips overrun={cost.overrun} />
    </>
  );
}
