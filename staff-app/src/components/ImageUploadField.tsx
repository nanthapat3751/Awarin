import { ChevronRight, ImageOff, Link2, Loader2, Upload, X } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";

import { preparePhoto } from "../lib/photo-resize";
import { uploadImage } from "../lib/uploads-api";

const ACCEPT = ["image/png", "image/jpeg", "image/webp"];

/** ลิงก์รูปที่รับ: http(s) เต็มเท่านั้น (รูปในระบบ API ส่งมาเป็นลิงก์เต็มอยู่แล้ว) */
function looksLikeImageUrl(url: string): boolean {
  return /^https?:\/\/\S+$/i.test(url);
}

/** รูปย่อหนึ่งช่อง — แยกเป็น component เพื่อให้ state "โหลดไม่ขึ้น" ผูกกับ url นั้น (key = url) ไม่ค้างข้ามรูป */
function Thumb({ url }: Readonly<{ url: string }>) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-[10px] text-slate-400">
        <ImageOff size={16} />
        โหลดไม่ขึ้น
      </span>
    );
  }
  return <img src={url} alt="" className="h-full w-full object-cover" onError={() => setBroken(true)} />;
}

/**
 * ช่องรูปภาพ: ลากรูปมาวาง/คลิกเลือก (อัปโหลด JPEG/PNG/WEBP) · รูปย่อลากเพื่อเรียง กด × เพื่อลบ ·
 * วางลิงก์รูปได้ แต่พับไว้เพราะใช้ไม่บ่อย
 *
 * ค่ายังเป็นรายการ URL คั่นด้วยบรรทัดใหม่เหมือนเดิม (หน้าที่ใช้ไม่ต้องแก้) — เดิมเป็นกล่องข้อความ
 * ให้วาง URL ทีละบรรทัด รูปที่อัปโหลดก็ไปโผล่เป็นข้อความยาว ๆ และไม่รู้ว่ารูปไหนเป็นปก
 *
 * `cover` = รายการนี้ใช้รูปแรกเป็นปก (ผลงาน · ภาพภายนอกของแบบบ้าน) → ติดป้าย "ปก" และมีปุ่มตั้งเป็นปก
 * `compact` = ช่องเพิ่มรูปเป็นกล่องเล็กขนาดเท่ารูปย่อต่อท้ายแถว แทนกล่องลากวางเต็มความกว้าง
 *   (ใช้เมื่อมีหลายช่องรูปในฟอร์มเดียว เช่นแท็บรูปของแบบบ้าน — กล่องใหญ่สามกล่องกินฟอร์มไปครึ่งหน้า)
 */
export function ImageUploadField({
  label,
  value,
  onChange,
  cover = false,
  compact = false,
}: Readonly<{
  /** ว่างได้ ถ้าชื่อช่องอยู่ที่อื่นแล้ว (เช่นชื่อแท็บ) */
  label: string;
  value: string;
  onChange: (value: string) => void;
  cover?: boolean;
  compact?: boolean;
}>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [showLink, setShowLink] = useState(false);
  const [link, setLink] = useState("");

  const urls = value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const commit = (next: string[]) => onChange(next.join("\n"));

  async function handleFiles(fileList: FileList | File[] | null) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;
    const images = files.filter((f) => ACCEPT.includes(f.type));
    // รูปจาก iPhone (HEIC) เบราว์เซอร์ส่วนใหญ่เปิดไม่ได้ — บอกทางแก้ ไม่ใช่แค่ "ไม่ใช่รูป"
    const heic = files.some((f) => /heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name));
    let skipped: string | null = null;
    if (images.length < files.length) {
      skipped = heic
        ? "ข้ามรูป HEIC (จาก iPhone) — ตั้งกล้องเป็น “ใช้ได้กับทุกเครื่อง” หรือแปลงเป็น JPG ก่อน"
        : "ข้ามไฟล์ที่ไม่ใช่รูป JPG / PNG / WEBP";
    }
    setError(skipped);
    if (images.length === 0) return;

    setUploading(images.length);
    // อัปทีละไฟล์ให้ลำดับรูปตรงกับที่เลือก · ไฟล์ไหนพังก็เก็บรูปที่อัปสำเร็จก่อนหน้าไว้ ไม่ทิ้งทั้งชุด
    const uploaded: string[] = [];
    try {
      for (const file of images) {
        // ย่อที่เบราว์เซอร์ก่อน — รูปกล้อง/เรนเดอร์ 6-15 MB เกินเพดาน 5 MB ของเซิร์ฟเวอร์ (เดิมอัปไม่ได้เลย)
        const res = await uploadImage(await preparePhoto(file));
        uploaded.push(res.url);
        setUploading((n) => n - 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      if (uploaded.length > 0) commit([...urls, ...uploaded]);
      setUploading(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function cancelLink() {
    setShowLink(false);
    setLink("");
    setError(null);
  }

  function addLink() {
    const url = link.trim();
    if (!url) return;
    if (!looksLikeImageUrl(url)) {
      setError("ลิงก์รูปต้องขึ้นต้นด้วย https://");
      return;
    }
    setError(null);
    commit([...urls, url]);
    setLink("");
  }

  function moveTo(from: number, to: number) {
    if (from === to) return;
    const next = [...urls];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    commit(next);
  }

  // รับไฟล์ที่ลากมาวาง — ใช้ทั้งกล่องใหญ่และกล่องเล็กแบบ compact
  const dropTarget = {
    onClick: () => inputRef.current?.click(),
    onDragOver: (e: DragEvent) => {
      if (dragIndex !== null) return; // กำลังลากเรียงรูปย่อ ไม่ใช่ลากไฟล์เข้ามา
      e.preventDefault();
      setDropActive(true);
    },
    onDragLeave: () => setDropActive(false),
    onDrop: (e: DragEvent) => {
      if (dragIndex !== null) return;
      e.preventDefault();
      setDropActive(false);
      handleFiles(e.dataTransfer.files);
    },
    disabled: uploading > 0,
  };
  const dropTone = dropActive
    ? "border-brand bg-brand/5 text-brand"
    : "border-slate-300 text-slate-500 hover:border-slate-400 hover:bg-slate-50";

  return (
    <div className="flex flex-col gap-1.5 text-xs text-slate-700">
      {(label || (cover && urls.length > 1)) && (
        <span>
          {label}
          {cover && urls.length > 1 && (
            <span className="text-slate-400">
              {label ? " · " : ""}ลากเพื่อเรียง รูปแรกเป็นปก
            </span>
          )}
        </span>
      )}

      {(urls.length > 0 || compact) && (
        <ul className="flex flex-wrap gap-2">
          {urls.map((url, i) => (
            <li
              key={`${url}-${i}`}
              draggable
              onDragStart={(e) => {
                setDragIndex(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (dragIndex === null) return;
                e.preventDefault();
              }}
              onDrop={(e) => {
                if (dragIndex === null) return;
                e.preventDefault();
                e.stopPropagation();
                moveTo(dragIndex, i);
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              className={`group relative h-16 w-24 cursor-grab overflow-hidden rounded-md border bg-slate-50 active:cursor-grabbing ${
                dragIndex === i ? "opacity-40" : ""
              } ${cover && i === 0 ? "border-brand ring-1 ring-brand" : "border-slate-200"}`}
            >
              <Thumb key={url} url={url} />
              {cover && i === 0 && (
                <span className="absolute left-1 top-1 rounded bg-brand px-1.5 text-[10px] font-medium leading-4 text-white">
                  ปก
                </span>
              )}
              {cover && i > 0 && (
                <button
                  type="button"
                  onClick={() => moveTo(i, 0)}
                  className="absolute inset-x-1 bottom-1 rounded bg-white/90 py-0.5 text-[10px] font-medium text-slate-700 opacity-0 transition-opacity hover:bg-white focus:opacity-100 group-hover:opacity-100 touch:opacity-100"
                >
                  ตั้งเป็นปก
                </button>
              )}
              <button
                type="button"
                onClick={() => commit(urls.filter((_, j) => j !== i))}
                aria-label={`ลบรูปที่ ${i + 1}`}
                title="ลบรูปนี้"
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/60 text-white hover:bg-red-600"
              >
                <X size={12} />
              </button>
            </li>
          ))}
          {compact && (
            <li>
              <button
                type="button"
                {...dropTarget}
                className={`flex h-16 w-24 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed text-center transition-colors disabled:cursor-wait ${dropTone}`}
              >
                {uploading > 0 ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-[11px]">เหลือ {uploading} รูป</span>
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    <span className="text-[11px] font-medium text-slate-600">เพิ่มรูป</span>
                  </>
                )}
              </button>
            </li>
          )}
        </ul>
      )}
      {compact && (
        <span className="text-[11px] text-slate-400">
          ลากไฟล์มาวางที่ช่อง “เพิ่มรูป” ได้ · JPG · PNG · WEBP · เลือกได้หลายรูปพร้อมกัน
        </span>
      )}

      <button
        type="button"
        {...dropTarget}
        className={`flex w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed px-3 py-4 text-center transition-colors disabled:cursor-wait ${dropTone} ${
          compact ? "hidden" : ""
        }`}
      >
        {uploading > 0 ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            <span>กำลังอัปโหลด… เหลือ {uploading} รูป</span>
          </>
        ) : (
          <>
            <Upload size={18} />
            <span>
              <span className="font-medium text-slate-700">ลากรูปมาวาง</span> หรือคลิกเพื่อเลือกไฟล์
            </span>
            <span className="text-[11px] text-slate-400">JPG · PNG · WEBP · เลือกได้หลายรูปพร้อมกัน</span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT.join(",")}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {showLink ? (
        <div className="flex gap-2">
          <span className="relative flex-1">
            <Link2 size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={link}
              autoFocus
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addLink();
                }
                // Esc = ยกเลิก (หยุดไม่ให้ไปปิดหน้าต่าง/ฟอร์มที่ครอบอยู่)
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  cancelLink();
                }
              }}
              placeholder="https://… วางลิงก์รูปแล้วกด Enter"
              className="w-full rounded-md border border-slate-300 py-1 pl-7 pr-2 text-sm"
            />
          </span>
          <button
            type="button"
            onClick={addLink}
            className="rounded-md border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50"
          >
            เพิ่ม
          </button>
          {/* เปิดช่องลิงก์แล้วต้องปิดกลับได้ (ผู้ใช้ขอ 17 ต.ค.) — ล้างลิงก์ที่พิมพ์ค้างทิ้ง */}
          <button
            type="button"
            onClick={cancelLink}
            className="rounded-md px-3 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            ยกเลิก
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowLink(true)}
          className="flex w-fit items-center gap-0.5 text-xs text-slate-500 hover:text-brand"
        >
          <ChevronRight size={14} /> ใช้ลิงก์รูปแทน
        </button>
      )}

      {error && <span className="text-red-600">{error}</span>}
    </div>
  );
}
