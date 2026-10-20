import type {
  BillingDocSummaryDto,
  ContractPaymentsViewDto,
  ContractRetentionDto,
  InstallmentPaymentDto,
  InstallmentWithPaymentsDto,
  RetentionReleaseDto,
} from "@systemboq/shared-types";
import { billingDocLabel } from "@systemboq/shared-types";
import { FileText, Receipt } from "lucide-react";
import { useState } from "react";

import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useConfirm } from "../lib/confirm-context";
import {
  issueInvoice,
  issueRetentionInvoice,
  issueRetentionReceipt,
  voidBillingDoc,
} from "../lib/contracts-api";
import { billingDocViewerPath } from "../lib/document-pdf";
import { useToast } from "../lib/toast-context";
import { Button } from "./Button";
import { DateInput } from "./DateInput";

const INPUT =
  "rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-800 " +
  "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

// ปุ่มลิงก์แบบพื้นมน (link-pill) — -mx/-my หักระยะ padding คืน ตัวหนังสืออยู่ที่เดิมไม่ดันแถว
const LINK_BUTTON = "link-pill -mx-2.5 -my-1 text-xs font-medium text-brand disabled:bg-transparent disabled:opacity-50";

/** ชื่อสั้นของเอกสารสำหรับต่อท้ายปุ่ม — "ยกเลิก" ลอย ๆ ไม่บอกว่าอะไรกำลังจะหาย */
function shortDocName(doc: BillingDocSummaryDto): string {
  return doc.type === "INVOICE" ? "ใบแจ้งหนี้" : "ใบเสร็จ";
}

function thaiDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

interface Ctx {
  projectId: string;
  contractId: string;
  onChange: (view: ContractPaymentsViewDto) => void;
}

/** ลิงก์เปิดเอกสารในแท็บใหม่ — ใช้หน้าดู PDF ของแอปเพื่อให้แท็บมีชื่อเอกสาร */
function DocLink({ doc, ctx }: Readonly<{ doc: BillingDocSummaryDto; ctx: Ctx }>) {
  const Icon = doc.type === "INVOICE" ? FileText : Receipt;
  return (
    <a
      href={billingDocViewerPath(ctx.projectId, ctx.contractId, doc.id)}
      target="_blank"
      rel="noreferrer"
      className={`link-pill -mx-2.5 -my-1 inline-flex items-center gap-1 text-xs ${
        doc.voidedAt ? "text-slate-400 line-through" : "font-medium text-brand"
      }`}
    >
      <Icon size={12} aria-hidden />
      {billingDocLabel(doc)} {doc.docNo}
    </a>
  );
}

/** ยกเลิกเอกสาร — ต้องพิมพ์เหตุผลในบรรทัด (เหตุผลพิมพ์ลงบนใบที่ยกเลิกและแจ้งลูกค้า) */
function VoidControl({ doc, ctx }: Readonly<{ doc: BillingDocSummaryDto; ctx: Ctx }>) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="text-xs text-slate-400 hover:text-rose-700" onClick={() => setOpen(true)}>
        ยกเลิกใบนี้
      </button>
    );
  }
  return <VoidForm doc={doc} ctx={ctx} onClose={() => setOpen(false)} />;
}

/**
 * ช่องเหตุผลการยกเลิกเอกสาร — ใช้ทั้งปุ่ม "ยกเลิกใบนี้" ในบรรทัด (เงินประกัน) และเมนู ⋯ ของงวดเงิน
 */
export function VoidForm({
  doc,
  ctx,
  onClose,
}: Readonly<{ doc: BillingDocSummaryDto; ctx: Ctx; onClose: () => void }>) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!reason.trim()) {
      toast.error("กรุณาระบุเหตุผลที่ยกเลิก");
      return;
    }
    setBusy(true);
    try {
      ctx.onChange(await voidBillingDoc(ctx.projectId, ctx.contractId, doc.id, reason.trim()));
      toast.success(`ยกเลิก ${doc.docNo} แล้ว`);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ยกเลิกไม่สำเร็จ");
      setBusy(false);
    }
  }

  return (
    <span className="flex w-full flex-wrap items-center gap-1.5">
      <input
        className={`${INPUT} min-w-48 flex-1`}
        placeholder={`เหตุผลที่ยกเลิก ${doc.docNo}`}
        maxLength={300}
        value={reason}
        autoFocus
        onChange={(e) => setReason(e.target.value)}
      />
      {/* เลขที่ใบหายจากยอดภาษีขายไปเลย ออกใหม่ต้องกินเลขใหม่ — กู้ไม่ได้ จึงเป็นแดงทึบ */}
      <Button size="sm" variant="danger" disabled={busy} onClick={() => void submit()}>
        ยกเลิก{shortDocName(doc)} {doc.docNo}
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={onClose}>
        ไม่ยกเลิก
      </Button>
    </span>
  );
}

/** ใบที่ยกเลิกแล้ว — ยังเปิดดูได้ (มีตรายกเลิกบนใบ) เลขที่จึงไม่หายไปจากสายตา */
function VoidedDocs({ docs, ctx }: Readonly<{ docs: BillingDocSummaryDto[]; ctx: Ctx }>) {
  if (docs.length === 0) return null;
  return (
    <ul className="flex flex-col gap-0.5">
      {docs.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
          <DocLink doc={d} ctx={ctx} />
          <span>ยกเลิกแล้ว{d.voidReason ? ` — ${d.voidReason}` : ""}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * ฟอร์มวางบิลในบรรทัด (เลือกกำหนดชำระ) — ใช้ทั้งงวดเงินและเงินประกันผลงาน
 */
function InvoiceForm({
  initialDueOn,
  today,
  hint,
  onIssue,
  onClose,
}: Readonly<{
  initialDueOn: string;
  today: string;
  hint: string;
  onIssue: (dueOn: string) => Promise<void>;
  onClose: () => void;
}>) {
  const toast = useToast();
  const [dueOn, setDueOn] = useState(initialDueOn);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!dueOn) {
      toast.error("เลือกกำหนดชำระก่อน");
      return;
    }
    setBusy(true);
    try {
      await onIssue(dueOn);
      onClose();
      toast.success("ออกใบแจ้งหนี้แล้ว — ลูกค้าได้รับแจ้งเตือน");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ออกใบแจ้งหนี้ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md bg-slate-50 p-2">
      <label className="flex flex-col gap-1 text-xs text-slate-500">
        <span>กำหนดชำระ</span>
        <DateInput min={today} className={INPUT} value={dueOn} onChange={(v) => setDueOn(v)} />
      </label>
      <Button size="sm" variant="brand" disabled={busy} onClick={() => void submit()}>
        {busy ? "กำลังออก..." : "ออกใบแจ้งหนี้"}
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={onClose}>
        ยกเลิก
      </Button>
      <p className="w-full text-xs text-slate-400">{hint}</p>
    </div>
  );
}

/**
 * ใบแจ้งหนี้ของงวด (แสดงอย่างเดียว) — ลิงก์เปิดใบ + กำหนดชำระ และฟอร์มวางบิลเมื่อแถวสั่งเปิด
 * ปุ่มวางบิลอยู่ที่ "ขั้นถัดไป" ท้ายแถว ส่วนยกเลิกใบอยู่ในเมนู ⋯ — ในบรรทัดเหลือแต่ของที่ต้องอ่าน
 */
export function InstallmentInvoice({
  item,
  today,
  ctx,
  formOpen,
  onFormClose,
}: Readonly<{
  item: InstallmentWithPaymentsDto;
  today: string;
  ctx: Ctx;
  formOpen: boolean;
  onFormClose: () => void;
}>) {
  const invoices = item.documents.filter((d) => d.type === "INVOICE");
  const active = invoices.find((d) => !d.voidedAt);
  const voided = invoices.filter((d) => d.voidedAt);

  return (
    <div className="mt-1 flex flex-col gap-1">
      {active && (
        <div className="flex flex-wrap items-center gap-2">
          <DocLink doc={active} ctx={ctx} />
          {active.dueOn && <span className="text-xs text-slate-500">ครบกำหนด {thaiDate(active.dueOn)}</span>}
        </div>
      )}
      {formOpen && !active && (
        <InvoiceForm
          // กำหนดชำระตั้งต้น = วันครบกำหนดที่ตั้งไว้แล้ว (ถ้ายังไม่เลย) ไม่งั้นให้เลือกเอง ไม่เดาให้
          initialDueOn={item.dueOn && item.dueOn >= today ? item.dueOn : ""}
          today={today}
          hint="ใช้ชื่อ ตำแหน่ง และลายเซ็นของคุณเป็นผู้วางบิล · กำหนดชำระจะเป็นวันครบกำหนดของงวดนี้ด้วย"
          onIssue={async (dueOn) => ctx.onChange(await issueInvoice(ctx.projectId, ctx.contractId, item.id, dueOn))}
          onClose={onFormClose}
        />
      )}
      <VoidedDocs docs={voided} ctx={ctx} />
    </div>
  );
}

/** ใบเสร็จของรายการรับเงินหนึ่งรายการ (ลิงก์อย่างเดียว) — ยังไม่ออกก็ไม่แสดงอะไร ปุ่มออกอยู่ท้ายแถว */
export function PaymentReceipt({
  payment,
  docs,
  ctx,
}: Readonly<{ payment: InstallmentPaymentDto; docs: BillingDocSummaryDto[]; ctx: Ctx }>) {
  const active = docs.find((d) => d.type === "RECEIPT" && d.paymentId === payment.id && !d.voidedAt);
  return active ? <DocLink doc={active} ctx={ctx} /> : null;
}

/** ใบเสร็จที่ยกเลิกแล้วของงวด (แสดงรวมไว้ใต้รายการรับเงิน) */
export function VoidedReceipts({ item, ctx }: Readonly<{ item: InstallmentWithPaymentsDto; ctx: Ctx }>) {
  return <VoidedDocs docs={item.documents.filter((d) => d.type === "RECEIPT" && d.voidedAt)} ctx={ctx} />;
}

/**
 * ใบแจ้งหนี้คืนเงินประกันผลงาน — ยอด = ที่ยังรอคืน · กำหนดชำระ = วันครบกำหนดคืนของสัญญา
 */
export function RetentionInvoice({
  retention,
  today,
  ctx,
}: Readonly<{ retention: ContractRetentionDto; today: string; ctx: Ctx }>) {
  const [open, setOpen] = useState(false);
  const invoices = retention.documents.filter((d) => d.type === "INVOICE");
  const active = invoices.find((d) => !d.voidedAt);
  const voided = invoices.filter((d) => d.voidedAt);

  return (
    <div className="flex flex-col gap-1">
      {active && (
        <div className="flex flex-wrap items-center gap-2">
          <DocLink doc={active} ctx={ctx} />
          {active.dueOn && <span className="text-xs text-slate-500">ครบกำหนด {thaiDate(active.dueOn)}</span>}
          <VoidControl doc={active} ctx={ctx} />
        </div>
      )}
      {!active && retention.balance.outstanding > 0 && !open && (
        <button type="button" className={`${LINK_BUTTON} self-start`} onClick={() => setOpen(true)}>
          + วางบิลคืนเงินประกัน (ออกใบแจ้งหนี้)
        </button>
      )}
      {open && (
        <InvoiceForm
          initialDueOn={retention.dueOn && retention.dueOn >= today ? retention.dueOn : ""}
          today={today}
          hint="กำหนดชำระจะเป็นวันครบกำหนดคืนเงินประกันของสัญญานี้ด้วย"
          onIssue={async (dueOn) => ctx.onChange(await issueRetentionInvoice(ctx.projectId, ctx.contractId, dueOn))}
          onClose={() => setOpen(false)}
        />
      )}
      <VoidedDocs docs={voided} ctx={ctx} />
    </div>
  );
}

/** ใบเสร็จของการรับคืนเงินประกันหนึ่งครั้ง — เป็นใบกำกับภาษีของเงินส่วนนี้ (ถ้าจด VAT) */
export function ReleaseReceipt({
  release,
  docs,
  ctx,
}: Readonly<{ release: RetentionReleaseDto; docs: BillingDocSummaryDto[]; ctx: Ctx }>) {
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const active = docs.find((d) => d.type === "RECEIPT" && d.retentionReleaseId === release.id && !d.voidedAt);

  async function issue() {
    const ok = await confirm(
      "ออกใบเสร็จรับเงินสำหรับเงินประกันที่ได้คืนครั้งนี้? ใบเสร็จจะกินเลขที่เอกสารจริงและลบไม่ได้ — ถ้าออกผิดต้องยกเลิกใบแล้วออกใหม่ด้วยเลขใหม่",
      { confirmLabel: "ออกใบเสร็จ", variant: "brand" },
    );
    if (!ok) return;
    setBusy(true);
    try {
      ctx.onChange(await issueRetentionReceipt(ctx.projectId, ctx.contractId, release.id));
      toast.success("ออกใบเสร็จรับเงินแล้ว");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ออกใบเสร็จไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (active) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <DocLink doc={active} ctx={ctx} />
        {user?.role === "OWNER" && <VoidControl doc={active} ctx={ctx} />}
      </span>
    );
  }
  return (
    <button type="button" className={LINK_BUTTON} disabled={busy} onClick={() => void issue()}>
      {busy ? "กำลังออก..." : "ออกใบเสร็จ"}
    </button>
  );
}

/** ใบเสร็จคืนเงินประกันที่ยกเลิกแล้ว */
export function VoidedReleaseReceipts({ docs, ctx }: Readonly<{ docs: BillingDocSummaryDto[]; ctx: Ctx }>) {
  return <VoidedDocs docs={docs.filter((d) => d.type === "RECEIPT" && d.voidedAt)} ctx={ctx} />;
}
