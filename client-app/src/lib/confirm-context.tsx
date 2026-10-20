import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type ConfirmVariant = "primary" | "danger" | "success";

interface ConfirmOptions {
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" (แดง) สำหรับการปฏิเสธ/การกระทำที่เป็นอันตราย, "success" (เขียว) สำหรับการยอมรับ,
   * "primary" (เข้ม, ค่าเริ่มต้น) สำหรับอย่างอื่นทั้งหมด ถ้าตั้งค่าเริ่มต้นเป็น "danger" จะทำให้กล่อง
   * ยืนยันที่ไม่เป็นอันตรายอย่างการยอมรับใบเสนอราคาติดป้ายผิด */
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

const CONFIRM_BUTTON_CLASS: Record<ConfirmVariant, string> = {
  primary: "bg-slate-800 hover:bg-slate-900",
  danger: "bg-red-600 hover:bg-red-700",
  success: "bg-emerald-600 hover:bg-emerald-700",
};

export function ConfirmProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | undefined>(undefined);

  const confirm = useCallback<ConfirmFn>((message, options) => {
    setRequest({
      message,
      confirmLabel: options?.confirmLabel ?? "ยืนยัน",
      cancelLabel: options?.cancelLabel ?? "ยกเลิก",
      variant: options?.variant ?? "primary",
    });
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  function handleChoice(value: boolean) {
    setRequest(null);
    resolveRef.current?.(value);
  }

  // Esc = ยกเลิก เหมือนกดฉากหลังหรือปุ่มยกเลิก
  const open = request !== null;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setRequest(null);
      resolveRef.current?.(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

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
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => handleChoice(false)}
                className="link-pill text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                {request.cancelLabel}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => handleChoice(true)}
                className={`text-sm text-white rounded px-4 py-1.5 ${CONFIRM_BUTTON_CLASS[request.variant]}`}
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
