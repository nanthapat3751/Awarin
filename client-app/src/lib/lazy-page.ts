import { lazy, type ComponentType } from "react";

/**
 * โหลดโค้ดของหน้าเมื่อเข้าไปใช้ — คนเปิดหน้าแรกไม่ต้องโหลดโค้ดพอร์ทัล/หน้า PDF/ฟอร์มสมัครไปด้วย
 *
 * กับดักของการแยกไฟล์: deploy เวอร์ชันใหม่แล้วไฟล์ชื่อเก่า (มี hash) ถูกลบ คนที่เปิดเว็บค้างไว้
 * กดไปหน้าอื่นจะโหลดไฟล์ไม่ได้ (404) → รีโหลดทั้งหน้าให้เองหนึ่งครั้งเพื่อรับ index.html ชุดใหม่
 * ถ้ารีโหลดแล้วยังพังภายใน 30 วิ = ไม่ใช่เรื่องเวอร์ชัน (เน็ตหลุด/เซิร์ฟเวอร์ล่ม) → โยน error ให้
 * ErrorBoundary ขึ้นหน้าแจ้ง ไม่วนรีโหลดไม่จบ
 */
const RELOADED_AT = "chunk-reload-at";
const RETRY_WINDOW_MS = 30_000;

export class ChunkLoadError extends Error {
  constructor(cause: unknown) {
    super("โหลดไฟล์ของหน้านี้ไม่สำเร็จ", { cause });
    this.name = "ChunkLoadError";
  }
}

/** รีโหลดหน้าเพื่อรับไฟล์เวอร์ชันใหม่ — คืน false ถ้าเพิ่งรีโหลดไปแล้วไม่นาน (ไม่ควรรีโหลดซ้ำ) */
export function reloadForNewVersion(): boolean {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(RELOADED_AT)) || 0;
  } catch {
    // sessionStorage ใช้ไม่ได้ (โหมดส่วนตัวบางเบราว์เซอร์) — ไม่มีที่จำว่ารีโหลดไปแล้ว จึงไม่รีโหลด กันวนไม่จบ
    return false;
  }
  if (Date.now() - last < RETRY_WINDOW_MS) return false;
  try {
    sessionStorage.setItem(RELOADED_AT, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

export function lazyPage<M extends Record<string, unknown>, K extends keyof M>(
  load: () => Promise<M>,
  name: K,
) {
  return lazy(async () => {
    try {
      const mod = await load();
      return { default: mod[name] as unknown as ComponentType<object> };
    } catch (err) {
      // ระหว่างรอรีโหลดคืน promise ที่ไม่มีวันจบ — ไม่งั้นหน้าแจ้ง error จะแวบขึ้นก่อนหน้าโหลดใหม่
      if (reloadForNewVersion()) return new Promise<never>(() => undefined);
      throw new ChunkLoadError(err);
    }
  }) as unknown as M[K];
}
