import { Download, Eye, FileText, Paperclip, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";

import {
  isPreviewableAttachment,
  type AttachmentKind,
  type AttachmentVisibility,
  type QuoteAttachmentDto,
} from "@systemboq/shared-types";

import { ApiError } from "../lib/api";
import {
  attachmentPreviewUrl,
  deleteAttachment,
  downloadAttachment,
  updateAttachment,
  uploadAttachment,
} from "../lib/attachments-api";
import { useConfirm } from "../lib/confirm-context";
import { useToast } from "../lib/toast-context";
import { badgeClass, type BadgeColor } from "../lib/status-badge";
import { Button } from "./Button";
import { Tooltip } from "./Tooltip";

const KIND_LABEL: Record<AttachmentKind, string> = {
  DESIGN: "แบบ",
  QUOTE: "ใบเสนอราคา",
  OTHER: "อื่นๆ",
};
const KIND_COLOR: Record<AttachmentKind, BadgeColor> = {
  DESIGN: "blue",
  QUOTE: "indigo",
  OTHER: "slate",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function QuoteAttachmentsPanel({
  projectId,
  quoteId,
  attachments,
  onChange,
}: Readonly<{
  projectId: string;
  quoteId: string;
  attachments: QuoteAttachmentDto[];
  onChange: () => void;
}>) {
  const confirm = useConfirm();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<AttachmentKind>("QUOTE");
  const [visibility, setVisibility] = useState<AttachmentVisibility>("CUSTOMER");
  const [busy, setBusy] = useState(false);

  async function handleUpload() {
    if (!file) return;
    setBusy(true);
    try {
      await uploadAttachment(projectId, quoteId, file, kind, visibility);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      onChange();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function toggleVisibility(a: QuoteAttachmentDto) {
    const next: AttachmentVisibility = a.visibility === "CUSTOMER" ? "INTERNAL" : "CUSTOMER";
    if (next === "CUSTOMER") {
      const ok = await confirm(
        `เปิดให้ลูกค้าเห็นและดาวน์โหลดไฟล์ “${a.fileName}” ใช่หรือไม่? ตรวจให้แน่ใจว่าไฟล์นี้ไม่มีข้อมูลต้นทุน/กำไรภายใน`,
        { confirmLabel: "ให้ลูกค้าเห็น", variant: "brand" },
      );
      if (!ok) return;
    }
    try {
      await updateAttachment(projectId, quoteId, a.id, { visibility: next });
      onChange();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "เปลี่ยนสถานะไม่สำเร็จ");
    }
  }

  async function handleDelete(a: QuoteAttachmentDto) {
    if (!(await confirm(`ลบไฟล์ “${a.fileName}”?`, { confirmLabel: "ลบ", variant: "danger" }))) return;
    try {
      await deleteAttachment(projectId, quoteId, a.id);
      onChange();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ลบไม่สำเร็จ");
    }
  }

  async function handleDownload(a: QuoteAttachmentDto) {
    try {
      await downloadAttachment(projectId, quoteId, a);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ดาวน์โหลดไม่สำเร็จ");
    }
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-2">
        <Paperclip size={13} /> ไฟล์แนบจริง (BOQ/แบบ ที่ทำจาก Excel/PDF)
      </p>

      {attachments.length === 0 && (
        <p className="text-xs text-slate-500 mb-2">ยังไม่มีไฟล์แนบ</p>
      )}

      {attachments.length > 0 && (
        <ul className="flex flex-col gap-1.5 mb-3">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center flex-wrap gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm"
            >
              <FileText size={15} className="text-slate-400 shrink-0" />
              <span className="text-slate-800 truncate max-w-[16rem]">{a.fileName}</span>
              <span className={badgeClass(KIND_COLOR[a.kind])}>{KIND_LABEL[a.kind]}</span>
              <span className={badgeClass(a.visibility === "CUSTOMER" ? "emerald" : "slate")}>
                {a.visibility === "CUSTOMER" ? "ให้ลูกค้าเห็น" : "ภายใน"}
              </span>
              <span className="text-xs text-slate-400">{formatSize(a.sizeBytes)}</span>
              <div className="ml-auto flex items-center gap-1">
                {isPreviewableAttachment(a.fileName) && (
                  // ลิงก์จริง ไม่ใช่ปุ่มที่ fetch ก่อนแล้วค่อยเปิดแท็บ — แท็บถูกเปิดในจังหวะที่กด
                  // ตัวบล็อกป๊อปอัปจึงไม่กินทิ้ง (ดู attachmentPreviewUrl)
                  <a
                    href={attachmentPreviewUrl(projectId, quoteId, a.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100"
                  >
                    <Eye size={14} /> เปิดดู
                  </a>
                )}
                <Button variant="ghost" size="sm" onClick={() => handleDownload(a)}>
                  <Download size={14} /> โหลด
                </Button>
                <Button
                  variant={a.visibility === "CUSTOMER" ? "dangerQuiet" : "brand"}
                  size="sm"
                  onClick={() => toggleVisibility(a)}
                >
                  {a.visibility === "CUSTOMER" ? "ซ่อนจากลูกค้า" : "ให้ลูกค้าเห็น"}
                </Button>
                <Tooltip label="ลบไฟล์แนบ" side="top" align="end">
                  <Button variant="dangerQuiet" size="sm" aria-label={`ลบไฟล์แนบ ${a.fileName}`} onClick={() => handleDelete(a)}>
                    <Trash2 size={14} />
                  </Button>
                </Tooltip>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center flex-wrap gap-2 border-t border-slate-200 pt-2.5">
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png,.webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-xs text-slate-500 file:mr-2 file:rounded-md file:border-0 file:bg-slate-200 file:px-2 file:py-1 file:text-xs file:text-slate-700 hover:file:bg-slate-300"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as AttachmentKind)}
          className="border border-slate-300 rounded-md px-2 py-1 text-xs"
        >
          <option value="QUOTE">ใบเสนอราคา</option>
          <option value="DESIGN">แบบ</option>
          <option value="OTHER">อื่นๆ</option>
        </select>
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as AttachmentVisibility)}
          className="border border-slate-300 rounded-md px-2 py-1 text-xs"
        >
          <option value="CUSTOMER">ให้ลูกค้าเห็น</option>
          <option value="INTERNAL">ภายใน (พนักงานเท่านั้น)</option>
        </select>
        <Button size="sm" onClick={handleUpload} disabled={!file || busy}>
          <Upload size={14} /> อัปโหลด
        </Button>
      </div>
    </div>
  );
}
