import type { InstallmentPaymentDto, PaymentMethod } from "@systemboq/shared-types";
import {
  PAYMENT_EVIDENCE_ACCEPT,
  PAYMENT_EVIDENCE_MAX_BYTES,
  PAYMENT_EVIDENCE_MAX_FILES,
} from "@systemboq/shared-types";
import { FileText, Image as ImageIcon, Paperclip, X } from "lucide-react";
import { useRef, useState } from "react";

import { SlipViewerDialog } from "./SlipViewerDialog";

const ALLOWED_EXT = new Set(PAYMENT_EVIDENCE_ACCEPT.split(","));

/** ชื่อหลักฐานตามช่องทาง — คำเดียวกับที่คนหน้างานพูด */
function evidenceNoun(method: PaymentMethod): string {
  if (method === "TRANSFER") return "สลิป";
  if (method === "CHEQUE") return "รูปเช็ค";
  if (method === "CASH") return "สำเนาใบเสร็จที่ลูกค้าเซ็น";
  return "หลักฐาน";
}

/** ตรวจไฟล์ฝั่งหน้าจอก่อนส่ง (เซิร์ฟเวอร์ตรวจซ้ำอีกชั้น) — คืนข้อความผิดพลาด หรือ null ถ้าผ่าน */
function checkEvidenceFile(file: File): string | null {
  const dot = file.name.lastIndexOf(".");
  const ext = dot < 0 ? "" : file.name.slice(dot).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return `${file.name}: รับเฉพาะรูป (JPG/PNG/WEBP) หรือ PDF`;
  if (file.size > PAYMENT_EVIDENCE_MAX_BYTES) return `${file.name}: ไฟล์ใหญ่เกิน 10 MB`;
  return null;
}

function FileIcon({ name }: Readonly<{ name: string }>) {
  return name.toLowerCase().endsWith(".pdf") ? (
    <FileText size={12} className="shrink-0" />
  ) : (
    <ImageIcon size={12} className="shrink-0" />
  );
}

/**
 * ช่องเลือกหลักฐานในฟอร์มรับเงิน (ยังไม่อัปโหลด — ส่งหลังบันทึกรายการแล้ว)
 * ลากไฟล์มาวางได้ หรือกดเลือก · ไม่บังคับ: สลิปมักตามมาทีหลัง แนบเพิ่มที่รายการได้
 *
 * `attached` = ไฟล์ที่ติดมากับรายการอยู่แล้ว (สลิปที่ลูกค้าแจ้งโอนมา) — โชว์ในช่องเดียวกัน กดดูได้ เอาออกไม่ได้
 * เดิมช่องว่างเปล่า + ข้อความ "จะแนบให้เอง" อยู่ห่างออกไป ผู้ใช้งงว่าต้องอัปสลิปซ้ำไหม (17 ต.ค.)
 */
export function EvidencePicker({
  method,
  files,
  onChange,
  onError,
  existingCount = 0,
  attached = [],
  attachedLabel = "จากลูกค้า",
}: Readonly<{
  method: PaymentMethod;
  files: File[];
  onChange: (files: File[]) => void;
  onError: (message: string) => void;
  existingCount?: number;
  attached?: { id: string; fileName: string; url: string }[];
  attachedLabel?: string;
}>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const room = PAYMENT_EVIDENCE_MAX_FILES - existingCount - files.length;
  const hasAny = attached.length > 0 || files.length > 0;

  function add(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      const problem = checkEvidenceFile(file);
      if (problem) {
        onError(problem);
        continue;
      }
      if (next.length + existingCount >= PAYMENT_EVIDENCE_MAX_FILES) {
        onError(`แนบได้ไม่เกิน ${PAYMENT_EVIDENCE_MAX_FILES} ไฟล์ต่อรายการ`);
        break;
      }
      next.push(file);
    }
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-1 text-xs text-slate-500">
      <span>
        หลักฐาน · {evidenceNoun(method)}
        {method === "CASH" && " (ถ้ามี)"}
      </span>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          add(e.dataTransfer.files);
        }}
        className={`flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-md border border-dashed px-2 py-1 ${
          over ? "border-brand bg-brand/5" : "border-slate-300 bg-white"
        }`}
      >
        {attached.map((a, i) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setViewing(i)}
            title={`${a.fileName} · แนบให้เองตอนบันทึก`}
            className="inline-flex max-w-[14rem] items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800 hover:bg-emerald-100"
          >
            <FileIcon name={a.fileName} />
            <span className="truncate">
              {attached.length === 1 ? evidenceNoun(method) : a.fileName}
              <span className="text-emerald-700/80"> · {attachedLabel}</span>
            </span>
          </button>
        ))}
        {files.map((f, i) => (
          <span
            key={`${f.name}-${i}`}
            className="inline-flex max-w-[12rem] items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-slate-700"
          >
            <FileIcon name={f.name} />
            <span className="truncate">{f.name}</span>
            <button
              type="button"
              aria-label={`เอา ${f.name} ออก`}
              onClick={() => onChange(files.filter((_, j) => j !== i))}
              className="rounded text-slate-400 hover:text-slate-700"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {room > 0 && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="link-pill -ml-2.5 inline-flex items-center gap-1 font-medium text-brand"
          >
            <Paperclip size={12} />
            {hasAny ? "แนบเพิ่ม" : `แนบ${evidenceNoun(method)} หรือลากไฟล์มาวาง`}
          </button>
        )}
        {viewing != null && attached.length > 0 && (
          <SlipViewerDialog
            title={[evidenceNoun(method), attachedLabel].filter(Boolean).join(" ")}
            files={attached}
            startIndex={viewing}
            onClose={() => setViewing(null)}
          />
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={PAYMENT_EVIDENCE_ACCEPT}
          className="hidden"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

/**
 * หลักฐานของรายการรับเงินที่บันทึกแล้ว — กดแล้วเปิดหน้าต่างดูสลิปแบบเดียวกับตอนตรวจแจ้งโอน (ดูอย่างเดียว)
 * แนบเพิ่มทีหลังได้ (สลิปมาทางไลน์ตามหลัง)
 * เงินโอนที่ไม่มีสลิปขึ้นเตือนสีส้ม ไม่บล็อก — ข้อมูลเก่าก่อนมีระบบนี้ไม่มีสลิปทั้งหมด
 */
export function PaymentEvidenceList({
  payment,
  urlOf,
  canDelete,
  busy,
  onAttach,
  onDelete,
  onError,
}: Readonly<{
  payment: InstallmentPaymentDto;
  urlOf: (evidenceId: string) => string;
  canDelete: (uploadedById: string | null) => boolean;
  busy: boolean;
  onAttach: (files: File[]) => void;
  onDelete: (evidenceId: string, fileName: string) => void;
  onError: (message: string) => void;
}>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const { evidence, method } = payment;
  const room = PAYMENT_EVIDENCE_MAX_FILES - evidence.length;

  function pick(list: FileList | null) {
    if (!list) return;
    const ok: File[] = [];
    for (const file of Array.from(list).slice(0, Math.max(room, 0))) {
      const problem = checkEvidenceFile(file);
      if (problem) onError(problem);
      else ok.push(file);
    }
    if (list.length > room) onError(`แนบได้ไม่เกิน ${PAYMENT_EVIDENCE_MAX_FILES} ไฟล์ต่อรายการ`);
    if (ok.length > 0) onAttach(ok);
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {method === "TRANSFER" && evidence.length === 0 && <span className="text-amber-700">ยังไม่มีสลิป</span>}
      {evidence.map((e, i) => (
        <span key={e.id} className="group/ev inline-flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setViewing(i)}
            title={uploadedTitle(e.fileName, e.uploadedByName)}
            className="link-pill -my-0.5 -ml-1.5 inline-flex max-w-[10rem] items-center gap-1 px-1.5 py-0.5 font-medium text-brand"
          >
            <FileIcon name={e.fileName} />
            <span className="truncate">{evidence.length === 1 ? evidenceNoun(method) : e.fileName}</span>
          </button>
          {canDelete(e.uploadedById) && (
            <button
              type="button"
              aria-label={`ลบไฟล์ ${e.fileName}`}
              disabled={busy}
              onClick={() => onDelete(e.id, e.fileName)}
              className="rounded p-0.5 text-slate-400 opacity-0 transition-opacity hover:text-red-600 focus:opacity-100 group-hover/ev:opacity-100 touch:opacity-100"
            >
              <X size={11} />
            </button>
          )}
        </span>
      ))}
      {room > 0 && (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 font-medium text-slate-700 hover:border-brand hover:text-brand disabled:opacity-50"
        >
          <Paperclip size={11} />
          {evidence.length === 0 ? `แนบ${slipNoun(method)}` : "เพิ่มไฟล์"}
        </button>
      )}
      {viewing != null && evidence.length > 0 && (
        <SlipViewerDialog
          title={evidenceNoun(method)}
          files={evidence.map((e) => ({ id: e.id, fileName: e.fileName, url: urlOf(e.id) }))}
          startIndex={viewing}
          onClose={() => setViewing(null)}
        />
      )}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={PAYMENT_EVIDENCE_ACCEPT}
        className="hidden"
        onChange={(ev) => {
          pick(ev.target.files);
          ev.target.value = "";
        }}
      />
    </span>
  );
}

function uploadedTitle(fileName: string, uploadedByName: string | null | undefined) {
  return uploadedByName ? `${fileName} · แนบโดย ${uploadedByName}` : fileName;
}

function slipNoun(method: PaymentMethod) {
  return method === "TRANSFER" ? "สลิป" : "หลักฐาน";
}
