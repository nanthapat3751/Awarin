import { ApiError, NetworkError } from "./api";

/**
 * แปลง error ดิบจาก apiFetch เป็นสิ่งที่หน้าเว็บเอาไปแสดงได้ — ที่เดียวสำหรับทุกฟอร์ม
 *
 * เดิมทุกหน้าทำเหมือนกันหมดคือ `err instanceof ApiError ? err.message : "<ข้อความสำรอง>"`
 * ผลคือความล้มเหลวคนละชนิดถูกยุบเป็นข้อความเดียว: เน็ตหลุดขึ้นว่า "เข้าสู่ระบบไม่สำเร็จ"
 * เหมือนกับรหัสผ่านผิด ทั้งที่สิ่งที่ผู้ใช้ต้องทำต่อคนละเรื่องกันโดยสิ้นเชิง
 */

export type FailureKind =
  /** ไปไม่ถึงเซิร์ฟเวอร์ — ลองใหม่ได้เลย ไม่ต้องแก้อะไรที่กรอกไว้ */
  | "network"
  /** ยิงถี่เกินเพดาน (429) — ต้องรอ */
  | "rateLimit"
  /** บัญชีถูกล็อกชั่วคราว (423) — ต้องรอ */
  | "locked"
  /** เซิร์ฟเวอร์พัง (5xx) — ไม่ใช่ความผิดผู้ใช้ */
  | "server"
  /** ข้อมูลที่กรอกมีปัญหา — ต้องแก้ที่ฟอร์ม */
  | "input";

export interface Failure {
  kind: FailureKind;
  message: string;
  /** วินาทีที่ต้องรอก่อนลองใหม่ (มีเฉพาะ rateLimit / locked) */
  retryAfter: number | null;
}

/**
 * ข้อผิดพลาดที่ฟอร์มตรวจเจอเองก่อนยิงคำขอ (รหัสผ่านไม่ผ่านกฎ, ยืนยันไม่ตรงกัน)
 * ใช้ชนิดเดียวกับที่มาจากเซิร์ฟเวอร์ กล่องแจ้งเตือนจะได้มีหน้าตาและพฤติกรรมเดียวกัน
 */
export function inputFailure(message: string): Failure {
  return { kind: "input", message, retryAfter: null };
}

/** ความล้มเหลวที่แก้ด้วยการกดลองใหม่เฉย ๆ ได้ — ฟอร์มจะโชว์ปุ่ม "ลองใหม่" ให้ */
/**
 * กรอกรหัส 6 หลักผิด → เลือกตัวเลขเดิมในช่องไว้ให้ พิมพ์รหัสใหม่ทับได้ทันทีไม่ต้องลบเอง
 * (เดิมตัวเลขที่ผิดค้างอยู่ ลูกค้าต้องลบทีละตัว) · เครือข่าย/เซิร์ฟเวอร์ล่มไม่เลือก — รหัสอาจถูกอยู่แล้ว
 * แค่กด "ลองใหม่" · หน่วงหนึ่งจังหวะให้ React วาดข้อความผิดพลาดเสร็จก่อน
 */
export function selectCodeAfterFailure(inputId: string, failure: Failure): void {
  if (isRetryable(failure.kind)) return;
  setTimeout(() => {
    const el = document.getElementById(inputId);
    if (el instanceof HTMLInputElement) {
      el.focus();
      el.select();
    }
  }, 0);
}

export function isRetryable(kind: FailureKind): boolean {
  return kind === "network" || kind === "server";
}

function networkMessage(err: NetworkError): string {
  if (err.timedOut) {
    return "เซิร์ฟเวอร์ตอบช้าผิดปกติ · ข้อมูลที่กรอกยังอยู่";
  }
  // navigator.onLine เป็นเท็จ = ออฟไลน์แน่นอน · เป็นจริงไม่ได้แปลว่าเน็ตใช้ได้จริง
  // (เชื่อมต่อเราเตอร์อยู่แต่เน็ตไม่ออกก็ยังเป็นจริง) จึงกล้าฟันธงได้ทางเดียว
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "ดูเหมือนอินเทอร์เน็ตหลุด · ตรวจการเชื่อมต่อ";
  }
  return "ต่อเซิร์ฟเวอร์ไม่ได้ · ข้อมูลที่กรอกยังอยู่";
}

/** "อีก X นาที" เมื่อเกินนาที ไม่งั้นบอกเป็นวินาที — "อีก 900 วินาที" อ่านแล้วไม่รู้ว่านานแค่ไหน */
export function waitText(seconds: number): string {
  if (seconds >= 60) return `${Math.ceil(seconds / 60)} นาที`;
  return `${seconds} วินาที`;
}

/**
 * @param fallback ข้อความเมื่อเซิร์ฟเวอร์ปฏิเสธโดยไม่ได้บอกเหตุผล — ใส่ให้ตรงกับงานของหน้านั้น
 *                 เช่น "เข้าสู่ระบบไม่สำเร็จ" · ใช้เฉพาะกรณีที่ไม่รู้จริง ๆ ว่าเกิดอะไรขึ้น
 */
export function describeFailure(err: unknown, fallback: string): Failure {
  if (err instanceof NetworkError) {
    return { kind: "network", message: networkMessage(err), retryAfter: null };
  }

  if (!(err instanceof ApiError)) {
    // ไม่ใช่ error ที่มาจากชั้นเครือข่ายเลย (เช่นบั๊กในโค้ดหน้าเว็บเอง) — ไม่โทษผู้ใช้
    return { kind: "server", message: fallback, retryAfter: null };
  }

  const retryAfter = err.retryAfter ?? null;

  if (err.status === 429) {
    return {
      kind: "rateLimit",
      message: retryAfter
        ? `ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่ในอีก ${waitText(retryAfter)}`
        : err.message,
      retryAfter,
    };
  }

  if (err.status === 423) {
    return { kind: "locked", message: err.message, retryAfter };
  }

  if (err.status >= 500) {
    return {
      kind: "server",
      message: "ระบบขัดข้องชั่วคราว ไม่ใช่ความผิดของคุณ",
      retryAfter: null,
    };
  }

  return { kind: "input", message: err.message, retryAfter: null };
}
