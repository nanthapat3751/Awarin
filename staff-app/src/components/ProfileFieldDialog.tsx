import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "./Button";

/**
 * หน้าต่างแก้ข้อมูลโปรไฟล์ทีละช่อง (แบบบัญชี Google / Apple ID) — เปิดจากการกดแถวในการ์ดโปรไฟล์
 * ช่องเดียว ปุ่มบันทึก/ยกเลิกชัดเจน กด Esc หรือพื้นหลังเพื่อปิด · Enter = บันทึก
 */
export function ProfileFieldDialog({
  title,
  description,
  initial,
  placeholder,
  inputType = "text",
  autoComplete,
  required = false,
  onSave,
  onClose,
}: Readonly<{
  title: string;
  description?: string;
  initial: string;
  placeholder?: string;
  inputType?: "text" | "tel";
  autoComplete?: string;
  /** ช่องที่ห้ามว่าง (ชื่อที่แสดง) · ช่องอื่นเว้นว่าง = ลบค่าออก */
  required?: boolean;
  /** คืนข้อความผิดพลาด (แสดงในหน้าต่าง) หรือ null = สำเร็จแล้ว ปิดหน้าต่างได้ */
  onSave: (value: string) => Promise<string | null>;
  onClose: () => void;
}>) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const next = value.trim();
    if (required && !next) {
      setError(`กรอก${title}ก่อนบันทึก`);
      return;
    }
    // ไม่ได้เปลี่ยนอะไร — ปิดไปเฉย ๆ ไม่ต้องยิงคำขอ
    if (next === initial.trim()) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    const problem = await onSave(next);
    setSaving(false);
    if (problem) setError(problem);
    else onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-label="ปิด"
        onClick={() => !saving && onClose()}
        className="absolute inset-0 h-full w-full cursor-default bg-slate-900/40"
      />
      <dialog
        open
        aria-modal="true"
        aria-labelledby="profile-field-title"
        className="relative w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
      >
        <form
          onSubmit={submit}
          className="contents"
        >
          <h2 id="profile-field-title" className="text-base font-semibold text-slate-800">
            แก้{title}
          </h2>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          <input
            ref={inputRef}
            type={inputType}
            inputMode={inputType === "tel" ? "tel" : undefined}
            autoComplete={autoComplete}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            placeholder={placeholder}
            aria-label={title}
            className="mt-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800"
          />
          {!required && <p className="mt-1.5 text-xs text-slate-400">เว้นว่างไว้ = ไม่แสดงข้อมูลนี้</p>}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </div>
        </form>
      </dialog>
    </div>,
    document.body,
  );
}
