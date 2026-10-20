import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { CheckCircle2, Info, Undo2, X, XCircle } from "lucide-react";

// แจ้งเตือนแบบ toast มุมจอ (เลื่อนหายเอง) แทน alert() เนทีฟที่บล็อกจอ + ไม่มี brand
// ใช้ pattern เดียวกับ confirm-context: Provider ครอบทั้งแอป + hook useToast() ในคอมโพเนนต์
type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  /** ปุ่มในแถบแจ้งเตือน เช่น "เลิกทำ" หลังย้ายของเข้าถังขยะ */
  undo?: () => void | Promise<void>;
  /** กดเลิกทำแล้วกำลังกู้คืนอยู่ — กันกดซ้ำและบอกผู้ใช้ว่ากำลังทำงาน */
  undoing?: boolean;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  /** แจ้งผลพร้อมปุ่ม "เลิกทำ" — ใช้กับการลบที่ย้อนกลับได้ (ย้ายเข้าถังขยะ)
   *  onUndo ต้องกู้คืนของและรีเฟรชหน้าที่เรียกเอง */
  undo: (message: string, onUndo: () => void | Promise<void>) => void;
}

const ToastContext = createContext<ToastApi | undefined>(undefined);

const META: Record<ToastType, { icon: typeof CheckCircle2; border: string; iconColor: string }> = {
  success: { icon: CheckCircle2, border: "border-l-emerald-500", iconColor: "text-emerald-500" },
  error: { icon: XCircle, border: "border-l-red-500", iconColor: "text-red-500" },
  info: { icon: Info, border: "border-l-brand", iconColor: "text-brand" },
};

// error ค้างนานกว่าให้อ่านทัน; success/info หายเร็วกว่า
const DURATION: Record<ToastType, number> = { success: 3000, error: 5000, info: 4000 };
// แถบที่มีปุ่มให้กดต้องอยู่นานกว่า — ต้องพอให้อ่านจบแล้วขยับเมาส์ไปกดทัน
const UNDO_DURATION = 9000;

export function ToastProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  // เก็บตัวนับเวลาไว้ยกเลิก เวลาผู้ใช้ปิดเองหรือกดเลิกทำ (ไม่งั้นแถบถูกลบซ้ำตอนหมดเวลา)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const remove = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (type: ToastType, message: string, undo?: () => void | Promise<void>) => {
      const id = ++idRef.current;
      setToasts((list) => [...list, { id, type, message, undo }]);
      timers.current.set(id, setTimeout(() => remove(id), undo ? UNDO_DURATION : DURATION[type]));
      return id;
    },
    [remove],
  );

  const runUndo = useCallback(
    async (item: ToastItem) => {
      if (!item.undo || item.undoing) return;
      // หยุดนับเวลา — การกู้คืนอาจใช้เวลาเกินอายุของแถบ แถบต้องไม่หายกลางคัน
      const timer = timers.current.get(item.id);
      if (timer) {
        clearTimeout(timer);
        timers.current.delete(item.id);
      }
      setToasts((list) => list.map((t) => (t.id === item.id ? { ...t, undoing: true } : t)));
      try {
        await item.undo();
        remove(item.id);
      } catch (err) {
        remove(item.id);
        push("error", err instanceof Error ? err.message : "กู้คืนไม่สำเร็จ");
      }
    },
    [push, remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => void push("success", m),
      error: (m) => void push("error", m),
      info: (m) => void push("info", m),
      undo: (m, onUndo) => void push("success", m, onUndo),
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
              <div className="flex-1">
                <p className="whitespace-pre-line break-words">{t.message}</p>
                {t.undo && (
                  <button
                    type="button"
                    onClick={() => runUndo(t)}
                    disabled={t.undoing}
                    className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-100 disabled:text-slate-400"
                  >
                    <Undo2 size={13} />
                    {t.undoing ? "กำลังกู้คืน..." : "เลิกทำ"}
                  </button>
                )}
              </div>
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
