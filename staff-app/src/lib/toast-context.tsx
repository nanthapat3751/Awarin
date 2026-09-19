import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { CheckCircle2, Info, X, XCircle } from "lucide-react";

// แจ้งเตือนแบบ toast มุมจอ (เลื่อนหายเอง) แทน alert() เนทีฟที่บล็อกจอ + ไม่มี brand
// ใช้ pattern เดียวกับ confirm-context: Provider ครอบทั้งแอป + hook useToast() ในคอมโพเนนต์
type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | undefined>(undefined);

const META: Record<ToastType, { icon: typeof CheckCircle2; border: string; iconColor: string }> = {
  success: { icon: CheckCircle2, border: "border-l-emerald-500", iconColor: "text-emerald-500" },
  error: { icon: XCircle, border: "border-l-red-500", iconColor: "text-red-500" },
  info: { icon: Info, border: "border-l-brand", iconColor: "text-brand" },
};

// error ค้างนานกว่าให้อ่านทัน; success/info หายเร็วกว่า
const DURATION: Record<ToastType, number> = { success: 3000, error: 5000, info: 4000 };

export function ToastProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (type: ToastType, message: string) => {
      const id = ++idRef.current;
      setToasts((list) => [...list, { id, type, message }]);
      setTimeout(() => remove(id), DURATION[type]);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push("success", m),
      error: (m) => push("error", m),
      info: (m) => push("info", m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="fixed top-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 pointer-events-none"
      >
        {toasts.map((t) => {
          const meta = META[t.type];
          const Icon = meta.icon;
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-2 rounded-lg border border-slate-200 border-l-4 ${meta.border} bg-white px-3 py-2.5 text-sm text-slate-800 shadow-lg toast-enter`}
            >
              <Icon size={18} className={`mt-0.5 shrink-0 ${meta.iconColor}`} />
              <p className="flex-1 whitespace-pre-line break-words">{t.message}</p>
              <button
                type="button"
                onClick={() => remove(t.id)}
                aria-label="ปิด"
                className="shrink-0 text-slate-400 hover:text-slate-500"
              >
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes toast-enter { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: none; } }
        .toast-enter { animation: toast-enter 160ms ease-out; }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
