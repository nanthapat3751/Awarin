import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * หน้าต่างแก้ข้อมูลบัญชี (แบบบัญชี Google / Apple ID) — เปิดจากการกดแถวในหน้า "บัญชีของฉัน"
 * ฟอร์มเดียวต่อหน้าต่าง · Enter = บันทึก · Esc / แตะพื้นหลัง = ปิด (ระหว่างบันทึกปิดไม่ได้)
 * มือถือเป็นแผ่นเลื่อนขึ้นจากขอบล่าง จอกว้างเป็นกล่องกลางจอ
 */
export function EditDialog({
  title,
  description,
  error,
  saving,
  onSubmit,
  onClose,
  children,
}: Readonly<{
  title: string;
  description?: string;
  error: string | null;
  saving: boolean;
  onSubmit: () => void;
  onClose: () => void;
  children: ReactNode;
}>) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    // โฟกัสช่องแรกให้พิมพ์ได้ทันที
    formRef.current?.querySelector<HTMLElement>("input:not([type=radio]), textarea, select")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    // ล็อกการเลื่อนหน้าข้างหลังระหว่างเปิดหน้าต่าง
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, saving]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
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
        aria-labelledby="edit-dialog-title"
        className="relative max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:max-w-md sm:rounded-2xl sm:p-6"
      >
        <form
          ref={formRef}
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="contents"
        >
          <h2 id="edit-dialog-title" className="text-lg font-semibold text-slate-800">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          <div className="mt-5 flex flex-col gap-4">{children}</div>
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 lg:min-h-10"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50 lg:min-h-10"
            >
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </form>
      </dialog>
    </div>,
    document.body,
  );
}
