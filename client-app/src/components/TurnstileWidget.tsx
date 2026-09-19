import { useEffect, useRef } from "react";

// site key ทดสอบของ Cloudflare (ผ่านเสมอ) เป็นค่าเริ่มต้น เพื่อให้ dev ใช้งานได้โดยไม่ต้องตั้งค่า —
// prod ต้องตั้ง VITE_TURNSTILE_SITE_KEY เป็น site key จริงจากแดชบอร์ด Cloudflare Turnstile
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "1x00000000000000000000AA";
const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// โหลดสคริปต์ Turnstile ครั้งเดียว แล้ว resolve เมื่อ window.turnstile พร้อมใช้
function loadTurnstileScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) {
      resolve();
      return;
    }
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("โหลด Turnstile ไม่สำเร็จ")));
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("โหลด Turnstile ไม่สำเร็จ"));
    document.head.appendChild(script);
  });
}

/**
 * วิดเจ็ต Cloudflare Turnstile — เรียก onVerify(token) เมื่อยืนยันสำเร็จ และ onVerify(null) เมื่อ
 * หมดอายุ/ผิดพลาด token ใช้ได้ครั้งเดียว ฉะนั้นถ้าส่งฟอร์มแล้วต้องลองใหม่ ให้เพิ่ม resetSignal เพื่อ
 * ขอ token ใหม่
 */
export function TurnstileWidget({
  onVerify,
  resetSignal = 0,
  size = "normal",
}: Readonly<{
  onVerify: (token: string | null) => void;
  resetSignal?: number;
  size?: "normal" | "compact" | "flexible";
}>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          size,
          callback: (token: string) => onVerify(token),
          "expired-callback": () => onVerify(null),
          "error-callback": () => onVerify(null),
        });
      })
      .catch(() => onVerify(null));

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* วิดเจ็ตอาจถูกถอดไปแล้ว */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (resetSignal > 0 && widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
      onVerify(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  return <div ref={containerRef} />;
}
