import type { QuoteDto } from "@systemboq/shared-types";
import { CheckCircle2, Clock, Send, Undo2 } from "lucide-react";
import { useState } from "react";

import { getMySignature } from "../lib/account-api";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useConfirm } from "../lib/confirm-context";
import { quoteApproval, returnQuoteForChanges } from "../lib/quotes-api";
import { useToast } from "../lib/toast-context";
import { Button } from "./Button";

/**
 * ขั้นอนุมัติของใบร่าง (ใบเสนอราคาสองช่องเซ็น: ผู้เสนอราคา + ผู้อนุมัติ)
 *
 *   ยังไม่ขอ → [ขออนุมัติ]            (เจ้าของเห็น [อนุมัติ] — ทำใบเองกดทีเดียวจบ ได้ทั้งสองช่อง)
 *   รออนุมัติ → เจ้าของ [อนุมัติ] [ส่งกลับให้แก้] · คนขอ [ถอนคำขอ]
 *   อนุมัติแล้ว → [ส่งให้ลูกค้า] · เจ้าของ [ส่งกลับให้แก้]
 *
 * ลายเซ็นที่ลงใบคือของคนที่กดเท่านั้น — ยังไม่มีลายเซ็นก็ทำต่อได้ แต่ต้องบอกก่อนว่าช่องจะว่าง
 */

async function signatureWarning(): Promise<string> {
  try {
    const sig = await getMySignature();
    return sig.dataUrl
      ? ""
      : "\n\nคุณยังไม่ได้ตั้งลายเซ็น — ช่องของคุณในใบนี้จะเป็นเส้นว่างให้เซ็นมือ (ตั้งได้ที่ บัญชีของฉัน)";
  } catch {
    return "";
  }
}

export function QuoteApprovalStatus({ quote }: Readonly<{ quote: QuoteDto }>) {
  const approval = quote.approval;
  if (quote.status !== "DRAFT" || !approval || approval.state === "NONE") return null;
  if (approval.state === "PENDING") {
    return (
      <span className="mt-1 flex items-center gap-1 whitespace-nowrap text-xs text-amber-700">
        <Clock size={12} /> รออนุมัติ · {approval.proposer?.name}
      </span>
    );
  }
  return (
    <span className="mt-1 flex items-center gap-1 whitespace-nowrap text-xs text-emerald-700">
      <CheckCircle2 size={12} /> อนุมัติแล้ว · {approval.approver?.name}
    </span>
  );
}

export function QuoteApprovalControls({
  projectId,
  quote,
  onChanged,
  onSend,
}: Readonly<{
  projectId: string;
  quote: QuoteDto;
  onChanged: () => Promise<void> | void;
  onSend: () => void;
}>) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState("");

  const isOwner = user?.role === "OWNER";
  const state = quote.approval?.state ?? "NONE";
  const isRequester = quote.approval?.proposer?.userId === user?.id;

  async function run(action: () => Promise<void>, success: string): Promise<boolean> {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      await onChanged();
      return true;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ทำรายการไม่สำเร็จ");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    const ok = await confirm(
      `ขออนุมัติใบเสนอราคา ${quote.quoteNo}? เจ้าของจะได้รับแจ้งเตือน\n\nระหว่างรออนุมัติ เนื้อหาในใบนี้ถูกล็อกไว้ — ถ้าแก้ BOQ ต้องถอนคำขอก่อน ใบนี้ถึงจะใช้ราคาใหม่${await signatureWarning()}`,
      { confirmLabel: "ขออนุมัติ" },
    );
    if (ok) await run(() => quoteApproval(projectId, quote.id, "submit"), "ส่งคำขออนุมัติแล้ว");
  }

  async function approve() {
    const self = state === "NONE";
    const ok = await confirm(
      self
        ? `อนุมัติใบเสนอราคา ${quote.quoteNo}? คุณจะเป็นทั้งผู้เสนอราคาและผู้อนุมัติ${await signatureWarning()}`
        : `อนุมัติใบเสนอราคา ${quote.quoteNo} ที่ ${quote.approval?.proposer?.name} ขอไว้?${await signatureWarning()}`,
      { confirmLabel: "อนุมัติ" },
    );
    if (ok) await run(() => quoteApproval(projectId, quote.id, "approve"), "อนุมัติแล้ว — ส่งให้ลูกค้าได้เลย");
  }

  async function withdraw() {
    const ok = await confirm(`ถอนคำขออนุมัติใบ ${quote.quoteNo}? ใบจะกลับเป็นฉบับร่าง แก้ไขได้ตามปกติ`, {
      confirmLabel: "ถอนคำขอ",
    });
    if (ok) await run(() => quoteApproval(projectId, quote.id, "withdraw"), "ถอนคำขอแล้ว");
  }

  async function sendBack() {
    // พลาดแล้วต้องไม่ปิดกล่อง — เหตุผลที่พิมพ์ไว้จะหายไปเปล่า ๆ
    if (await run(() => returnQuoteForChanges(projectId, quote.id, note.trim()), "ส่งกลับให้แก้แล้ว")) {
      setReturning(false);
      setNote("");
    }
  }

  if (returning) {
    return (
      <div className="flex w-full min-w-72 flex-col gap-2">
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          เหตุผลที่ส่งกลับ (ผู้ขอจะเห็นข้อความนี้)
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            autoFocus
            placeholder="เช่น ค่าแรงหมวดหลังคาต่ำเกินไป"
            className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-800"
          />
        </label>
        <div className="flex gap-2">
          <Button size="sm" onClick={sendBack} disabled={busy || note.trim() === ""}>
            <Undo2 size={14} /> ส่งกลับให้แก้
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setReturning(false)} disabled={busy}>
            ยกเลิก
          </Button>
        </div>
      </div>
    );
  }

  const returnButton = isOwner && state !== "NONE" && (
    <Button size="sm" variant="ghost" onClick={() => setReturning(true)} disabled={busy}>
      <Undo2 size={14} /> ส่งกลับให้แก้
    </Button>
  );
  const withdrawButton = isRequester && state !== "NONE" && (
    <Button size="sm" variant="dangerQuiet" onClick={withdraw} disabled={busy}>
      ถอนคำขอ
    </Button>
  );

  if (state === "APPROVED") {
    return (
      <>
        <Button size="sm" variant="brand" onClick={onSend} disabled={busy}>
          <Send size={14} /> ส่งให้ลูกค้า
        </Button>
        {returnButton}
        {!isOwner && withdrawButton}
      </>
    );
  }

  if (state === "PENDING") {
    return (
      <>
        {isOwner ? (
          <Button size="sm" variant="brand" onClick={approve} disabled={busy}>
            <CheckCircle2 size={14} /> อนุมัติ
          </Button>
        ) : (
          <span className="text-xs text-amber-700">รอเจ้าของอนุมัติ</span>
        )}
        {returnButton}
        {withdrawButton}
      </>
    );
  }

  return isOwner ? (
    <Button size="sm" variant="brand" onClick={approve} disabled={busy}>
      <CheckCircle2 size={14} /> อนุมัติ
    </Button>
  ) : (
    <Button size="sm" variant="neutral" onClick={submit} disabled={busy}>
      <Send size={14} /> ขออนุมัติ
    </Button>
  );
}

/** เหตุผลที่เจ้าของส่งกลับ — ค้างไว้ให้เห็นจนกว่าจะขออนุมัติใหม่ */
export function QuoteReturnNote({ quote }: Readonly<{ quote: QuoteDto }>) {
  if (quote.status !== "DRAFT" || !quote.approvalReturnNote || quote.approval?.state !== "NONE") return null;
  return (
    <p className="text-sm text-amber-800">
      <span className="font-medium">เจ้าของส่งกลับให้แก้:</span> {quote.approvalReturnNote}
    </p>
  );
}

/** ระหว่างขออนุมัติ ไฟล์ที่ลูกค้าเห็นแก้ไม่ได้ — บอกไว้เหนือแผงไฟล์แนบ ไม่ให้กดแล้วค่อยเจอ error */
export function QuoteLockedNote({ quote }: Readonly<{ quote: QuoteDto }>) {
  if (quote.status !== "DRAFT" || (quote.approval?.state ?? "NONE") === "NONE") return null;
  return (
    <p className="text-xs text-slate-500">
      ใบนี้ขออนุมัติแล้ว — ไฟล์ที่ลูกค้าเห็นถูกล็อกไว้ และถ้าแก้ BOQ ตอนนี้ ราคาใหม่จะไม่เข้าไปในใบนี้
      (ต้องถอนคำขอหรือส่งกลับให้แก้ก่อน)
    </p>
  );
}
