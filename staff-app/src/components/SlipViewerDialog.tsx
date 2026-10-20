import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  ImageOff,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { isPdfName, useAuthedFile } from "../lib/use-authed-file";
import { Button } from "./Button";

export interface SlipFile {
  id: string;
  fileName: string;
  url: string;
}

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** รูปย่อของสลิปหนึ่งไฟล์ (กดแล้วเปิดหน้าต่างตรวจ) — PDF เป็นไอคอนเอกสาร · ระหว่างโหลดเป็นแสงวิ่ง */
export function SlipThumb({
  file,
  label,
  onOpen,
  size = "md",
}: Readonly<{ file: SlipFile; label: string; onOpen: () => void; size?: "sm" | "md" }>) {
  const pdf = isPdfName(file.fileName);
  const { src, error } = useAuthedFile(pdf ? null : file.url);
  const box = size === "sm" ? "h-12 w-9" : "h-[76px] w-14";
  let body: ReactNode;
  if (pdf) {
    body = (
      <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-white text-slate-500">
        <FileText size={18} aria-hidden />
        <span className="text-[10px] font-medium">PDF</span>
      </span>
    );
  } else if (error) {
    body = (
      <span className="flex h-full w-full items-center justify-center bg-white text-slate-400">
        <ImageOff size={16} aria-hidden />
      </span>
    );
  } else if (src) {
    body = <img src={src} alt="" className="h-full w-full object-cover" />;
  } else {
    body = <span aria-hidden className="skeleton block h-full w-full rounded-none" />;
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`ดู${label}`}
      title={file.fileName}
      className={`${box} shrink-0 overflow-hidden rounded-md border border-slate-300 bg-slate-100 shadow-sm transition hover:border-brand hover:shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`}
    >
      {body}
    </button>
  );
}

/** ตัวแสดงไฟล์ฝั่งซ้ายของหน้าต่าง — รูปซูมได้ (พอดีกรอบ ↔ 2 เท่า เลื่อนดูได้) · PDF ฝังทั้งไฟล์ */
function SlipCanvas({ file, zoomed, onToggleZoom }: Readonly<{ file: SlipFile; zoomed: boolean; onToggleZoom: () => void }>) {
  const pdf = isPdfName(file.fileName);
  const { src, error } = useAuthedFile(file.url);
  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-slate-300">
        <ImageOff size={28} aria-hidden />
        เปิดไฟล์ไม่สำเร็จ — ลองปิดแล้วเปิดใหม่
      </div>
    );
  }
  // พื้นโปร่งบนพื้นเข้ม (ก้อนเทาทึบจะโดดออกมา) — utility ชนะเพราะ .skeleton อยู่ใน @layer components
  if (!src) return <div aria-hidden className="skeleton h-full w-full rounded-none bg-white/10" />;
  if (pdf) return <iframe title={file.fileName} src={src} className="h-full w-full bg-white" />;
  return (
    <div className={`h-full w-full ${zoomed ? "overflow-auto" : "flex items-center justify-center overflow-hidden p-4"}`}>
      {/* คลิกรูป = สลับซูม (แบบดูรูปทั่วไป) */}
      <button
        type="button"
        onClick={onToggleZoom}
        aria-label={zoomed ? "ย่อรูปให้พอดีกรอบ" : "ขยายรูป"}
        className={zoomed ? "block cursor-zoom-out" : "block h-full w-full cursor-zoom-in"}
      >
        <img
          src={src}
          alt={file.fileName}
          className={zoomed ? "max-w-none" : "mx-auto h-full w-full object-contain"}
          style={zoomed ? { width: "200%" } : undefined}
        />
      </button>
    </div>
  );
}

export interface SlipReview {
  /** ยอดที่ลูกค้าแจ้งว่าโอน */
  notified: number;
  /** ยอดที่ควรเข้าบัญชีถ้าชำระครบงวด (หลังหัก ณ ที่จ่าย / เงินประกัน) — null = คำนวณไม่ได้ */
  expected: number | null;
  paidOnText: string;
  submittedBy: string | null;
  note: string | null;
  busy: boolean;
  /** เปิดฟอร์มรับเงินที่เติมวันที่/ยอดจากการแจ้งไว้ให้ */
  onConfirm: () => void;
  /** คืน true เมื่อแจ้งลูกค้าสำเร็จ (ปิดหน้าต่าง) */
  onReject: (reason: string) => Promise<boolean>;
}

/**
 * หน้าต่างตรวจสลิป (แบบ C ผู้ใช้เลือก 15 ต.ค. 2569) — รูปใหญ่ซ้าย · ยอดเทียบ + ปุ่มตัดสินขวา
 * ตรวจตัวเลขบนสลิปกับยอดที่ต้องได้ในหน้าต่างเดียว ไม่ต้องสลับแท็บจำตัวเลขไปมา
 * ไม่ส่ง `review` = ดูอย่างเดียว (หลักฐานของรายการรับเงินที่ยืนยันแล้ว)
 * กล่องกลางจอ ไม่ใช่แผงเลื่อนจากขวา (ผู้ใช้ไม่ชอบแผงขวา) · Esc / คลิกพื้นหลัง = ปิด · ← → เปลี่ยนไฟล์
 */
export function SlipViewerDialog({
  title,
  files,
  startIndex = 0,
  review,
  onClose,
}: Readonly<{
  title: string;
  files: SlipFile[];
  startIndex?: number;
  review?: SlipReview;
  onClose: () => void;
}>) {
  const [index, setIndex] = useState(Math.min(startIndex, files.length - 1));
  const [zoomed, setZoomed] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const busy = review?.busy ?? false;
  const file = files[index];
  const many = files.length > 1;

  const go = useCallback(
    (step: number) => {
      setIndex((i) => (i + step + files.length) % files.length);
      setZoomed(false);
    },
    [files.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
      // ลูกศรใช้เปลี่ยนไฟล์เฉพาะตอนไม่ได้พิมพ์เหตุผลอยู่
      if (rejecting) return;
      if (e.key === "ArrowRight" && many) go(1);
      if (e.key === "ArrowLeft" && many) go(-1);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, busy, rejecting, many, go]);

  const mismatch =
    review?.expected != null && Math.abs(review.notified - review.expected) > 0.009 ? review.expected : null;
  const fileSrc = useAuthedFile(file.url).src;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        tabIndex={-1}
        aria-label="ปิด"
        onClick={() => !busy && onClose()}
        className="absolute inset-0 h-full w-full cursor-default bg-slate-900/60"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="slip-viewer-title"
        className="relative grid h-[min(88vh,760px)] w-full max-w-5xl grid-rows-[minmax(0,1fr)_auto] overflow-hidden rounded-xl bg-white shadow-2xl md:grid-cols-[minmax(0,1fr)_320px] md:grid-rows-1"
      >
        {/* ── ซ้าย: ตัวไฟล์ ── */}
        <div className="relative min-h-0 bg-slate-900">
          <SlipCanvas key={file.id} file={file} zoomed={zoomed} onToggleZoom={() => setZoomed((z) => !z)} />

          {many && (
            <>
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="ไฟล์ก่อนหน้า"
                className="absolute top-1/2 left-2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow hover:bg-white"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="ไฟล์ถัดไป"
                className="absolute top-1/2 right-2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow hover:bg-white"
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}

          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-slate-900/75 px-2 py-1 text-xs text-white">
            {many && (
              <span className="px-1.5 tabular-nums">
                {index + 1}/{files.length}
              </span>
            )}
            {!isPdfName(file.fileName) && (
              <button
                type="button"
                onClick={() => setZoomed((z) => !z)}
                aria-label={zoomed ? "ย่อรูป" : "ขยายรูป"}
                className="rounded-full p-1 hover:bg-white/15"
              >
                {zoomed ? <ZoomOut size={15} /> : <ZoomIn size={15} />}
              </button>
            )}
            {fileSrc && (
              <a
                href={fileSrc}
                target="_blank"
                rel="noopener"
                aria-label="เปิดไฟล์ในแท็บใหม่"
                title="เปิดไฟล์ในแท็บใหม่"
                className="rounded-full p-1 hover:bg-white/15"
              >
                <ExternalLink size={15} />
              </a>
            )}
          </div>
        </div>

        {/* ── ขวา: รายละเอียด + ตัดสิน ── */}
        <div className="flex min-h-0 flex-col overflow-y-auto border-t border-slate-200 md:border-t-0 md:border-l">
          <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div className="min-w-0">
              <h2 id="slip-viewer-title" className="text-base font-semibold text-slate-800">
                {title}
              </h2>
              <p className="truncate text-xs text-slate-500" title={file.fileName}>
                {file.fileName}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="ปิด"
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            >
              <X size={18} />
            </button>
          </div>

          {review ? (
            <div className="flex flex-1 flex-col gap-4 px-4 py-4">
              <dl className="divide-y divide-slate-100 text-sm">
                <div className="flex items-baseline justify-between gap-3 py-2">
                  <dt className="text-slate-500">ลูกค้าแจ้งว่าโอน</dt>
                  <dd className="text-base font-semibold tabular-nums text-slate-900">{money(review.notified)}</dd>
                </div>
                {review.expected != null && (
                  <div className="flex items-baseline justify-between gap-3 py-2">
                    <dt className="text-slate-500">ยอดที่ควรเข้าบัญชี</dt>
                    <dd className="tabular-nums text-slate-700">{money(review.expected)}</dd>
                  </div>
                )}
                <div className="flex items-baseline justify-between gap-3 py-2">
                  <dt className="text-slate-500">วันที่โอน</dt>
                  <dd className="text-slate-700">{review.paidOnText}</dd>
                </div>
                {review.submittedBy && (
                  <div className="flex items-baseline justify-between gap-3 py-2">
                    <dt className="text-slate-500">แจ้งโดย</dt>
                    <dd className="truncate text-slate-700">{review.submittedBy}</dd>
                  </div>
                )}
              </dl>

              {mismatch != null && (
                <p className="flex gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
                  <span>
                    ยอดที่แจ้ง{review.notified > mismatch ? "มากกว่า" : "น้อยกว่า"}ยอดที่ควรเข้าบัญชี{" "}
                    {money(Math.abs(review.notified - mismatch))} บาท — อาจโอนบางส่วนหรือหักภาษีไม่ตรง
                    ตรวจตัวเลขบนสลิปกับบัญชีธนาคารให้แน่ใจ
                  </span>
                </p>
              )}

              {review.note && (
                <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">“{review.note}”</p>
              )}

              <div className="mt-auto flex flex-col gap-2">
                {rejecting ? (
                  <>
                    <label htmlFor="slip-reject-reason" className="text-sm font-medium text-slate-700">
                      เหตุผลที่ลูกค้าจะเห็น
                    </label>
                    <textarea
                      id="slip-reject-reason"
                      rows={3}
                      maxLength={300}
                      autoFocus
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="เช่น ยังไม่พบเงินเข้า / ยอดไม่ตรงกับสลิป"
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
                    />
                    <Button
                      variant="dangerQuiet"
                      disabled={busy || !reason.trim()}
                      onClick={() =>
                        void review.onReject(reason.trim()).then((ok) => {
                          if (ok) onClose();
                        })
                      }
                    >
                      {busy ? "กำลังส่ง..." : "แจ้งลูกค้าว่าไม่ตรง"}
                    </Button>
                    <Button variant="ghost" disabled={busy} onClick={() => setRejecting(false)}>
                      กลับ
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-slate-500">ตรวจกับบัญชีธนาคารก่อน แล้วค่อยกดยืนยัน</p>
                    <Button
                      variant="brand"
                      disabled={busy}
                      onClick={() => {
                        onClose();
                        review.onConfirm();
                      }}
                    >
                      <Check size={16} /> ยืนยันรับเงิน
                    </Button>
                    <Button variant="ghost" disabled={busy} onClick={() => setRejecting(true)}>
                      ไม่ตรง — แจ้งลูกค้า
                    </Button>
                    <p className="text-center text-[11px] text-slate-400">
                      ยืนยันแล้วจะเปิดฟอร์มรับเงินที่เติมวันที่และยอดไว้ให้
                    </p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <p className="px-4 py-4 text-sm text-slate-500">หลักฐานของรายการรับเงินที่บันทึกแล้ว</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
