import {
  PAYMENT_EVIDENCE_ACCEPT,
  PAYMENT_EVIDENCE_MAX_BYTES,
  PAYMENT_NOTICE_MAX_FILES,
} from "@systemboq/shared-types";
import { CalendarDays, FileText, ImageUp, X } from "lucide-react";
import { useRef, useState, type DragEvent, type ReactNode } from "react";

import { ApiError } from "../lib/api";
import { submitPaymentNotice } from "../lib/my-api";

import { DateInput } from "./DateInput";

/** วันนี้ตามเวลาเครื่องลูกค้า (YYYY-MM-DD) — ลูกค้าอยู่ไทย เวลาเครื่องตรงกับวันทำการของบริษัท */
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const ALLOWED_EXT = new Set(PAYMENT_EVIDENCE_ACCEPT.split(","));

/** สิ่งที่เพิ่งส่งสำเร็จ — หน้าใช้แสดง "แจ้งโอนแล้ว" ทันทีระหว่างรอโหลดข้อมูลงวดใหม่ */
export interface SentNotice {
  paidOn: string;
  amount: number;
  fileCount: number;
}
const FIELD = "min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 lg:min-h-0";

/**
 * ฟอร์มแจ้งโอนของงวดเดียว (แบบ D — อยู่ในการ์ดสรุปงวดด้านขวา ปุ่มส่งอยู่ใต้การ์ด)
 * ยอดตั้งต้น = ยอดที่ต้องโอน · ต้องแนบสลิปอย่างน้อยหนึ่งไฟล์ ปุ่มส่งจึงกดได้
 * บอกตรง ๆ ว่าการแจ้งยังไม่ใช่การชำระ งวดเปลี่ยนเป็นชำระแล้วเมื่อบริษัทตรวจพบเงินเข้า
 */
export function PaymentNoticeForm({
  contractId,
  installmentId,
  defaultAmount,
  summary,
  onSubmitted,
}: Readonly<{
  contractId: string;
  installmentId: string;
  defaultAmount: number;
  /** เนื้อหาสรุปงวด — วางไว้บนสุดของการ์ดเดียวกับช่องแนบสลิป */
  summary: ReactNode;
  onSubmitted: (sent: SentNotice) => void;
}>) {
  const [paidOn, setPaidOn] = useState(todayLocal());
  const [amount, setAmount] = useState(defaultAmount.toFixed(2));
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    setError(null);
    for (const file of Array.from(list)) {
      const dot = file.name.lastIndexOf(".");
      const ext = dot < 0 ? "" : file.name.slice(dot).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) {
        setError(`${file.name}: รับเฉพาะรูปภาพ (JPG/PNG) หรือ PDF`);
        continue;
      }
      if (file.size > PAYMENT_EVIDENCE_MAX_BYTES) {
        setError(`${file.name}: ไฟล์ใหญ่เกิน 10 MB`);
        continue;
      }
      if (next.length >= PAYMENT_NOTICE_MAX_FILES) {
        setError(`แนบได้ไม่เกิน ${PAYMENT_NOTICE_MAX_FILES} ไฟล์`);
        break;
      }
      next.push(file);
    }
    setFiles(next);
  }

  async function submit() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("ใส่ยอดที่โอน");
      return;
    }
    if (!paidOn) {
      setError("ใส่วันที่โอน");
      return;
    }
    if (files.length === 0) {
      setError("แนบสลิปการโอนอย่างน้อย 1 ไฟล์");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await submitPaymentNotice(contractId, { installmentId, paidOn, amount: value, note: note.trim() }, files);
      onSubmitted({ paidOn, amount: value, fileCount: files.length });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ส่งไม่สำเร็จ ลองใหม่อีกครั้ง");
      setBusy(false);
    }
  }

  const drop = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      addFiles(e.dataTransfer.files);
    },
  };
  const full = files.length >= PAYMENT_NOTICE_MAX_FILES;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        {summary}
        <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-5 text-sm">
          <p className="font-semibold text-slate-900">แจ้งโอน</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              วันที่โอน
              {/* ไอคอนปฏิทินของ DateInput วางแบบ absolute — ต้องมีกล่อง relative ครอบ */}
              <span className="relative">
                <DateInput
                  value={paidOn}
                  max={todayLocal()}
                  onChange={setPaidOn}
                  icon={<CalendarDays size={16} aria-hidden />}
                  className={`${FIELD} w-full pl-10`}
                />
              </span>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              ยอดที่โอน (บาท)
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`${FIELD} text-right tabular-nums`}
              />
            </label>
          </div>

          {files.length > 0 && (
            <ul className="flex flex-col gap-1.5" aria-label="สลิปที่แนบ">
              {files.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="flex items-center gap-2 rounded-md bg-slate-50 py-1 pl-3 pr-1 text-xs text-slate-700"
                >
                  <FileText size={14} className="shrink-0 text-slate-400" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <button
                    type="button"
                    aria-label={`เอา ${f.name} ออก`}
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    className="inline-flex min-h-9 min-w-9 items-center justify-center rounded text-slate-400 hover:bg-white hover:text-slate-700"
                  >
                    <X size={14} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!full && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              {...drop}
              className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-3 text-center transition-colors ${
                files.length === 0 ? "py-5" : "py-2.5"
              } ${dragging ? "border-brand bg-brand/5" : "border-slate-300 hover:border-brand/60 hover:bg-slate-50"}`}
            >
              {files.length === 0 && <ImageUp size={20} className="text-slate-400" aria-hidden />}
              <span className="text-slate-600">
                <span className="font-medium text-brand">{files.length === 0 ? "แนบสลิป" : "เพิ่มไฟล์"}</span> หรือลากมาวาง
              </span>
              {files.length === 0 && (
                <span className="text-xs text-slate-400">
                  JPG / PNG / PDF ไม่เกิน 10 MB · สูงสุด {PAYMENT_NOTICE_MAX_FILES} ไฟล์
                </span>
              )}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={PAYMENT_EVIDENCE_ACCEPT}
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />

          {showNote ? (
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              หมายเหตุ (ถ้ามี)
              <input
                value={note}
                maxLength={500}
                autoFocus
                onChange={(e) => setNote(e.target.value)}
                placeholder="เช่น โอนจากบัญชีบริษัท หัก ณ ที่จ่ายไว้ 3%"
                className={FIELD}
              />
            </label>
          ) : (
            <button
              type="button"
              onClick={() => setShowNote(true)}
              className="link-pill -ml-2.5 inline-flex min-h-11 items-center self-start text-xs font-medium text-brand lg:min-h-0"
            >
              + เพิ่มหมายเหตุ
            </button>
          )}
          {error && (
            <p role="alert" className="text-xs text-rose-700">
              {error}
            </p>
          )}
        </div>
      </div>
      <button
        type="submit"
        disabled={busy || files.length === 0}
        className="inline-flex min-h-12 items-center justify-center rounded-lg bg-brand px-4 text-sm font-medium text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-brand/30"
      >
        {busy ? "กำลังส่ง..." : "ส่งแจ้งโอน"}
      </button>
      <p className="text-center text-xs text-slate-500">
        {files.length === 0 ? "แนบสลิปก่อนจึงส่งได้ · " : ""}
        บริษัทจะตรวจกับบัญชีก่อน งวดจะขึ้นว่าชำระแล้วหลังตรวจพบเงินเข้า
      </p>
    </form>
  );
}
