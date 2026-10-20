export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  details?: unknown;
  /** วินาทีที่ต้องรอก่อนลองใหม่ (มากับสถานะถูกล็อก 423) — หน้า login เอาไปนับถอยหลัง */
  retryAfter?: number;

  constructor(message: string, status: number, details?: unknown, retryAfter?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
    this.retryAfter = retryAfter;
  }
}

/**
 * คำขอไปไม่ถึงเซิร์ฟเวอร์ — คนละเรื่องกับ "เซิร์ฟเวอร์ตอบว่าข้อมูลผิด"
 *
 * `fetch` โยน TypeError ธรรมดาเมื่อเน็ตหลุด/เซิร์ฟเวอร์ล่ม ซึ่งหน้าเว็บแยกจาก error อื่นไม่ออก
 * ทุกหน้าจึงตกไปใช้ข้อความสำรองของตัวเอง กลายเป็น "เข้าสู่ระบบไม่สำเร็จ" ทั้งที่รหัสผ่านถูกต้อง
 * — คนอ่านแล้วนึกว่าตัวเองพิมพ์ผิด แล้วลองซ้ำจนบัญชีถูกล็อก
 */
export class NetworkError extends Error {
  /** true = คำขอถูกตัดเพราะรอนานเกินไป (เซิร์ฟเวอร์ค้าง) · false = ยิงไม่ออกตั้งแต่แรก */
  timedOut: boolean;

  constructor(timedOut: boolean) {
    super(timedOut ? "คำขอใช้เวลานานเกินไป" : "ต่อเซิร์ฟเวอร์ไม่ได้");
    this.name = "NetworkError";
    this.timedOut = timedOut;
  }
}

/**
 * เพดานเวลารอคำตอบ — ไม่มีเพดาน คำขอที่ค้างจะทำให้ปุ่มขึ้น "กำลังเข้าสู่ระบบ..." ค้างตลอดไป
 * โดยไม่มีอะไรบอกว่าเกิดอะไรขึ้นและกดใหม่ก็ไม่ได้ (ปุ่มถูก disable อยู่)
 *
 * 30 วินาทีเผื่อเน็ตมือถือช้า ๆ ไว้มากแล้ว ปลายทางในแอปนี้เป็น JSON ล้วน ไม่มีตัวไหนคิดนาน
 * (ดาวน์โหลดไฟล์กับ PDF ใช้ฟังก์ชันแยกข้างล่าง ไม่โดนเพดานนี้)
 */
const REQUEST_TIMEOUT_MS = 30_000;

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: "include",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
  } catch (err) {
    // TimeoutError มาจาก AbortSignal.timeout ส่วน TypeError คือยิงไม่ถึงปลายทาง
    throw new NetworkError(err instanceof DOMException && err.name === "TimeoutError");
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const body = await res.json().catch(() => undefined);

  if (!res.ok) {
    throw new ApiError(body?.error ?? "เกิดข้อผิดพลาด", res.status, body?.details, body?.retryAfter);
  }

  return body as T;
}

/** ส่งไฟล์แบบ multipart — ไม่ใส่ Content-Type เอง ให้เบราว์เซอร์ตั้ง boundary ให้ */
export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { method: "POST", credentials: "include", body: formData });
  } catch {
    throw new NetworkError(false);
  }
  const body = await res.json().catch(() => undefined);
  if (!res.ok) {
    throw new ApiError(body?.error ?? "อัปโหลดไม่สำเร็จ", res.status, body?.details, body?.retryAfter);
  }
  return body as T;
}

/** ดาวน์โหลดไฟล์ที่ API เสิร์ฟแบบตรวจสิทธิ์ (fetch พร้อม cookie แล้ว trigger บันทึกด้วยชื่อจริง) */
export async function downloadFile(path: string, fileName: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => undefined);
    throw new ApiError(body?.error ?? "ดาวน์โหลดไฟล์ไม่สำเร็จ", res.status);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * ดึง PDF ที่ API สร้างขึ้นมาเป็น object URL สำหรับฝังใน <iframe> ของหน้าดูเอกสาร
 *
 * ใช้ fetch แทนการชี้ src ไปที่ API ตรง ๆ ด้วยสองเหตุผล: การ navigate ระดับบนสุดจะไม่ส่ง header
 * Origin ทำให้ API เดาไม่ออกว่า request นี้เป็นของ session cookie ไหน; และเมื่อล้มเหลวมันจะแสดง
 * JSON ดิบในแท็บแทนที่จะเป็นข้อความที่ลูกค้าอ่านเข้าใจได้
 *
 * ผู้เรียกต้อง URL.revokeObjectURL() เองตอนเลิกใช้ (หน้าดูเอกสารทำตอน unmount)
 */
// คำขอ PDF ที่กำลังวิ่งอยู่ — StrictMode ของ dev เรียก effect หน้าดูเอกสารสองรอบติดกัน ถ้าไม่ใช้คำขอร่วมกัน
// เซิร์ฟเวอร์ต้องสั่ง Puppeteer สร้างไฟล์เดียวกันสองรอบพร้อมกัน ใบที่ผู้ใช้รอดูจึงช้าลงเกือบเท่าตัว
const pdfInFlight = new Map<string, Promise<Blob>>();

async function fetchPdfBlob(path: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });

  if (!res.ok) {
    const body = await res.json().catch(() => undefined);
    throw new ApiError(body?.error ?? "เปิดไฟล์ไม่สำเร็จ", res.status);
  }

  return res.blob();
}

export async function fetchPdfObjectUrl(path: string): Promise<string> {
  let pending = pdfInFlight.get(path);
  if (!pending) {
    // เก็บไว้แค่ระหว่างรอ — เปิดใหม่ภายหลังต้องได้ไฟล์ล่าสุดเสมอ ไม่ใช่ของเก่าที่จำไว้
    pending = fetchPdfBlob(path).finally(() => pdfInFlight.delete(path));
    pdfInFlight.set(path, pending);
  }
  // object URL แยกต่อผู้เรียก — รอบที่ถูกยกเลิก revoke ของตัวเองได้โดยไม่กระทบอีกรอบ
  return URL.createObjectURL(await pending);
}
