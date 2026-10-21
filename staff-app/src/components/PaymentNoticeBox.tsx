import type { PaymentNoticeDto, SlipCheckDto, SlipCheckStatus } from "@systemboq/shared-types";
import { AlertTriangle, BadgeCheck, BellRing, CircleSlash, RefreshCw, ScanSearch, ShieldX } from "lucide-react";
import { useState } from "react";

import { SlipThumb, SlipViewerDialog, type SlipFile } from "./SlipViewerDialog";

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function thaiDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

const timeFormat = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * ผลตรวจสลิปกับธนาคาร (SlipOK) — ผ่าน = เขียว + ปุ่มยืนยันคลิกเดียว · ไม่ตรง = เหลือง (บอกจุด) · ตรวจไม่ได้ = เทา
 * **ผ่าน ≠ เงินเข้าเอง** พนักงานยังเป็นคนกด (ผู้ใช้เลือก flow ที่สอง 18 ต.ค.)
 */
function SlipCheckLine({
  check,
  busy,
  onConfirmSlip,
  onRecheckSlip,
}: Readonly<{ check: SlipCheckDto; busy: boolean; onConfirmSlip?: () => void; onRecheckSlip?: () => void }>) {
  const ok = check.files.filter((f) => f.status === "PASSED");
  const total = ok.reduce((sum, f) => sum + Number(f.amount ?? 0), 0);
  const first = ok[0];
  if (check.status === "PASSED") {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-emerald-900">
        <BadgeCheck size={14} className="shrink-0 text-emerald-700" />
        <span className="min-w-0 flex-1">
          <span className="font-medium">ตรวจสลิปกับธนาคารแล้ว</span> — {money(total)} บาท เข้าบัญชีบริษัท
          {first?.transferredAt && <> · โอน {timeFormat.format(new Date(first.transferredAt))}</>}
          {first?.senderName && <> · จาก {first.senderName}</>}
        </span>
        {onConfirmSlip && (
          // ปุ่มประจำแถว = มีกรอบ ไม่ทึบ (ระบบสีปุ่ม) · ถามยืนยันก่อนเสมอ (ออกใบเสร็จลบไม่ได้)
          <button
            type="button"
            disabled={busy}
            onClick={onConfirmSlip}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-600 bg-white px-2.5 py-1 font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
          >
            <BadgeCheck size={13} /> ยืนยัน & ออกใบเสร็จ
          </button>
        )}
      </div>
    );
  }
  if (check.status === "MISMATCH") {
    return (
      <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-900">
        <p className="flex items-center gap-1.5 font-medium">
          <AlertTriangle size={14} className="shrink-0 text-amber-600" /> สลิปจริง แต่มีจุดไม่ตรง — ตรวจก่อนยืนยัน
        </p>
        <ul className="mt-0.5 list-disc pl-6">
          {ok.length > 0 && <li>ธนาคารยืนยันรายการโอน {money(total)} บาท</li>}
          {check.flags.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>
    );
  }
  // ตรวจซ้ำแล้วเจอว่าซ้ำ/ผิดบัญชี — การแจ้งถูกรับไว้แล้ว ระบบไม่ปฏิเสธเอง พนักงานกด "ไม่ตรง" พร้อมเหตุผล
  const rejectLabel = REJECT_LABEL[check.status];
  if (rejectLabel) {
    return (
      <p className="flex items-start gap-1.5 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-red-900">
        <ShieldX size={14} className="mt-0.5 shrink-0 text-red-600" />
        <span>
          <span className="font-medium">ตรวจสลิปไม่ผ่าน: {rejectLabel}</span> — ไม่ควรยืนยันรับเงิน กด "ตรวจสลิป" แล้วแจ้งลูกค้าว่าไม่ตรง
        </span>
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-start gap-x-2 gap-y-1 rounded border border-slate-200 bg-white px-2 py-1.5 text-slate-600">
      <CircleSlash size={14} className="mt-0.5 shrink-0 text-slate-400" />
      <span className="min-w-0 flex-1">
        ตรวจสลิปอัตโนมัติไม่ได้{check.flags.length > 0 ? ` (${check.flags.join(" · ")})` : ""} — ตรวจกับบัญชีธนาคารเองแบบเดิม
      </span>
      {onRecheckSlip && (
        // สลิปไทยพาณิชย์/กรุงเทพ ธนาคารให้ตรวจหลังโอนราว 8 นาที · ระบบธนาคารขัดข้องชั่วคราว — ลองใหม่ได้
        <button
          type="button"
          disabled={busy}
          onClick={onRecheckSlip}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={12} /> ตรวจสลิปอีกครั้ง
        </button>
      )}
    </div>
  );
}

const REJECT_LABEL: Partial<Record<SlipCheckStatus, string>> = {
  FAKE: "ธนาคารไม่พบรายการโอน",
  DUPLICATE: "สลิปเคยใช้แจ้งแล้ว",
  WRONG_ACCOUNT: "โอนเข้าบัญชีอื่น",
};

/**
 * การแจ้งที่ระบบตรวจสลิปปฏิเสธ (ปลอม/ซ้ำ/ผิดบัญชี) — ผู้ใช้เลือกให้เก็บไว้ให้พนักงานเห็น
 * ไม่มีปุ่มตัดสิน: ลูกค้าเห็นเหตุผลแล้วแจ้งใหม่เอง · มีไว้ให้รู้ทันว่ามีคนพยายามใช้สลิปไม่ถูกต้อง
 */
export function SlipRejectedNotices({
  notices,
  evidenceUrl,
}: Readonly<{ notices: PaymentNoticeDto[]; evidenceUrl: (noticeId: string, evidenceId: string) => string }>) {
  const [viewing, setViewing] = useState<PaymentNoticeDto | null>(null);
  return (
    <div className="mt-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-900">
      <p className="flex items-center gap-1.5 font-medium">
        <ShieldX size={13} className="shrink-0 text-red-600" /> ระบบตรวจสลิปปฏิเสธการแจ้งโอน {notices.length} ครั้ง (90 วันล่าสุด)
      </p>
      <ul className="mt-0.5 flex flex-col gap-0.5 pl-5">
        {notices.map((n) => (
          <li key={n.id} className="flex flex-wrap items-center gap-x-1.5">
            <span>
              {thaiDate(n.createdAt.slice(0, 10))} · แจ้ง {money(Number(n.amount))} บาท ·{" "}
              {(n.slipCheck && REJECT_LABEL[n.slipCheck.status]) ?? "ตรวจไม่ผ่าน"}
            </span>
            {n.evidence.length > 0 && (
              <button type="button" onClick={() => setViewing(n)} className="font-medium text-red-700 underline">
                ดูสลิป
              </button>
            )}
          </li>
        ))}
      </ul>
      {viewing && (
        <SlipViewerDialog
          title="สลิปที่ระบบตรวจสลิปปฏิเสธ"
          files={viewing.evidence.map((e) => ({ id: e.id, fileName: e.fileName, url: evidenceUrl(viewing.id, e.id) }))}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

/**
 * ลูกค้าแจ้งโอนมาแล้ว รอตรวจ — อยู่ใต้งวดของตัวเอง
 *
 * แบบ C (ผู้ใช้เลือก 15 ต.ค. 2569): เห็นรูปย่อสลิปในกล่องทันที · ปุ่ม "ตรวจสลิป" (หรือกดรูปย่อ) เปิดหน้าต่าง
 * รูปใหญ่ + ยอดเทียบ + ปุ่มตัดสิน — เดิมเป็นลิงก์ "สลิป" เปิดแท็บใหม่ ต้องสลับแท็บจำตัวเลขไปมา
 *
 * ยังไม่ใช่เงินเข้า: พนักงานต้องเปิดบัญชีธนาคารดูก่อน แล้วค่อยกด "ยืนยันรับเงิน" (เปิดฟอร์มรับเงิน
 * ที่เติมวันที่/ยอดจากการแจ้งไว้ให้) หรือ "ไม่ตรง" พร้อมเหตุผลที่ลูกค้าจะเห็น
 */
export function PaymentNoticeBox({
  notice,
  seq,
  expected,
  evidenceUrl,
  busy,
  onConfirm,
  onConfirmSlip,
  onRecheckSlip,
  onReject,
}: Readonly<{
  notice: PaymentNoticeDto;
  /** งวดที่ — ใช้ตั้งหัวหน้าต่างตรวจ */
  seq: number;
  /** ยอดที่ควรเข้าบัญชีถ้าชำระครบงวด (หลังหัก ณ ที่จ่าย/เงินประกัน) — สูตรเดียวกับฟอร์มรับเงิน */
  expected: number | null;
  evidenceUrl: (evidenceId: string) => string;
  busy: boolean;
  onConfirm: () => void;
  /** ยืนยัน & ออกใบเสร็จคลิกเดียว — ใช้เฉพาะเมื่อระบบตรวจสลิปผ่าน */
  onConfirmSlip?: () => void;
  /** ตรวจสลิปอีกครั้ง — ใช้เมื่อยังตรวจไม่ได้ */
  onRecheckSlip?: () => void;
  /** คืน true เมื่อปฏิเสธสำเร็จ */
  onReject: (reason: string) => Promise<boolean>;
}>) {
  const [viewing, setViewing] = useState<number | null>(null);
  const files: SlipFile[] = notice.evidence.map((e) => ({ id: e.id, fileName: e.fileName, url: evidenceUrl(e.id) }));
  const amount = Number(notice.amount);
  const label = (i: number) => (files.length > 1 ? `สลิป ${i + 1}` : "สลิป");

  return (
    <div className="mt-1.5 flex gap-3 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-2 text-xs text-sky-900">
      {files.length > 0 && (
        <div className="flex shrink-0 gap-1.5">
          {files.map((f, i) => (
            <SlipThumb key={f.id} file={f} label={label(i)} onOpen={() => setViewing(i)} />
          ))}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <BellRing size={13} className="shrink-0 text-sky-600" />
          <span>
            {notice.submittedByName ?? "ลูกค้า"} แจ้งโอน{" "}
            <span className="font-semibold tabular-nums">{money(amount)}</span> บาท · วันที่{" "}
            {thaiDate(notice.paidOn)}
          </span>
        </p>
        {notice.note && <p className="text-sky-800">“{notice.note}”</p>}
        {notice.slipCheck && (
          <SlipCheckLine check={notice.slipCheck} busy={busy} onConfirmSlip={onConfirmSlip} onRecheckSlip={onRecheckSlip} />
        )}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-0.5">
          {/* ปุ่มประจำแถว = มีกรอบ ไม่ทึบ (ระบบสีปุ่ม) */}
          <button
            type="button"
            disabled={busy}
            onClick={() => setViewing(0)}
            className="inline-flex items-center gap-1 rounded-md border border-brand/30 bg-white px-2.5 py-1 font-medium text-brand hover:bg-brand/5 disabled:opacity-50"
          >
            <ScanSearch size={13} /> ตรวจสลิป
          </button>
          <span className="text-sky-700">
            {files.length > 1 ? `สลิป ${files.length} ใบ · ` : ""}ดูยอดเทียบแล้วยืนยันหรือแจ้งว่าไม่ตรงในหน้าต่างเดียว
          </span>
        </div>
      </div>

      {viewing != null && files.length > 0 && (
        <SlipViewerDialog
          title={`ตรวจสลิป งวดที่ ${seq}`}
          files={files}
          startIndex={viewing}
          onClose={() => setViewing(null)}
          review={{
            notified: amount,
            expected,
            paidOnText: thaiDate(notice.paidOn),
            submittedBy: notice.submittedByName,
            note: notice.note,
            busy,
            onConfirm,
            onReject,
          }}
        />
      )}
    </div>
  );
}
