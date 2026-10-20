import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type ConfirmVariant = "neutral" | "brand" | "danger";

interface ConfirmOptions {
  confirmLabel?: string;
  cancelLabel?: string;
  /** ใช้คำเดียวกับ variant ของ <Button> (ดู components/Button.tsx):
   * "neutral" (เทาเข้ม) = ยืนยันงานที่ยังอยู่ในบ้านเรา ย้อนได้ — เป็นค่าเริ่มต้น
   * "brand" (นาวี) = ปล่อยของออกไปถึงคนนอกจริง เช่น ออกเอกสารที่กินเลข ส่งของถึงลูกค้า
   * "danger" (แดงทึบ) = กู้ไม่ได้ หรือคนนอกรู้ไปแล้ว
   * ถ้าตั้งค่าเริ่มต้นเป็น "danger" จะทำให้กล่องยืนยันที่ไม่ใช่การลบทุกอันติดป้ายผิด */
  variant?: ConfirmVariant;
}

interface ConfirmRequest {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: ConfirmVariant;
}

type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | undefined>(undefined);

/** ปุ่มสองอันใช้โครงเดียวกัน ต่างกันแค่สี — จะได้สูงเท่ากันพอดี ไม่เหลื่อมกัน */
const BUTTON_BASE =
  "inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

/** ปุ่มรอง (ยกเลิก) — ขอบเทาพื้นขาว แบบที่ dialog ทั่วไปใช้กัน กดง่ายกว่าลิงก์ขีดเส้นใต้ */
const CANCEL_BUTTON_CLASS =
  "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-400";

const CONFIRM_BUTTON_CLASS: Record<ConfirmVariant, string> = {
  neutral: "border-transparent bg-slate-800 text-white hover:bg-slate-900 focus-visible:ring-slate-500",
  brand: "border-transparent bg-[#000099] text-white hover:bg-[#000077] focus-visible:ring-[#000099]",
  danger: "border-transparent bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500",
};

export function ConfirmProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | undefined>(undefined);

  const confirm = useCallback<ConfirmFn>((message, options) => {
    setRequest({
      message,
      confirmLabel: options?.confirmLabel ?? "ยืนยัน",
      cancelLabel: options?.cancelLabel ?? "ยกเลิก",
      variant: options?.variant ?? "neutral",
    });
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  // กด Esc เท่ากับกด "ยกเลิก" — เข้าคู่กับการคลิกพื้นหลังที่มีอยู่แล้ว เป็นสิ่งที่คนคาดหวังจากกล่องแบบนี้
  useEffect(() => {
    if (!request) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleChoice(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  function handleChoice(value: boolean) {
    setRequest(null);
    resolveRef.current?.(value);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
          {/* ฉากหลังเป็นปุ่มจริง (กดแล้วยกเลิก) — ไม่ต้องดัก onClick บน div แล้วกันไม่ให้ลามเข้ากล่อง */}
          <button
            type="button"
            tabIndex={-1}
            aria-label={request.cancelLabel}
            onClick={() => handleChoice(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-black/40"
          />
          <div
            role="alertdialog"
            aria-modal="true"
            className="relative bg-white rounded-lg shadow-xl max-w-sm w-full p-6"
          >
            <p className="text-slate-800 whitespace-pre-line">{request.message}</p>
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                autoFocus={request.variant === "danger"}
                onClick={() => handleChoice(false)}
                className={`${BUTTON_BASE} ${CANCEL_BUTTON_CLASS}`}
              >
                {request.cancelLabel}
              </button>
              <button
                type="button"
                autoFocus={request.variant !== "danger"}
                onClick={() => handleChoice(true)}
                className={`${BUTTON_BASE} ${CONFIRM_BUTTON_CLASS[request.variant]}`}
              >
                {request.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
