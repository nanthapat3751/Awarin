export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  details?: unknown;
  /** วินาทีที่ต้องรอก่อนลองใหม่ (มากับสถานะถูกล็อก 423) — หน้า login เอาไปนับถอยหลัง */
  retryAfter?: number;
  /** ขั้นกรอกรหัส 2FA: เซิร์ฟเวอร์ทิ้งเซสชันครึ่งทางแล้ว ต้องกลับไปกรอกรหัสผ่านใหม่ */
  restartLogin: boolean;
  /** รหัสเหตุจากเซิร์ฟเวอร์ (ถ้ามี) ให้หน้าจอแยกกรณีได้โดยไม่เดาจากข้อความ เช่น OVERRUN_REASON_REQUIRED */
  code?: string;

  constructor(message: string, status: number, details?: unknown, retryAfter?: number, restartLogin = false) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
    this.retryAfter = retryAfter;
    this.restartLogin = restartLogin;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const body = await res.json().catch(() => undefined);

  if (!res.ok) {
    const error = new ApiError(
      body?.error ?? "เกิดข้อผิดพลาด",
      res.status,
      body?.details,
      body?.retryAfter,
      body?.restartLogin === true,
    );
    if (typeof body?.code === "string") error.code = body.code;
    throw error;
  }

  return body as T;
}

/** อัปโหลดไฟล์แบบ multipart — ไม่ตั้ง Content-Type เอง ปล่อยให้ browser ใส่ boundary ให้ */
export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => undefined);
  if (!res.ok) {
    throw new ApiError(body?.error ?? "อัปโหลดไม่สำเร็จ", res.status, body?.details);
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
 * JSON ดิบในแท็บแทนที่จะเป็นข้อความที่อ่านเข้าใจได้
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
