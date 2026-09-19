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
    throw new ApiError(body?.error ?? "เกิดข้อผิดพลาด", res.status, body?.details, body?.retryAfter);
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
export async function fetchPdfObjectUrl(path: string): Promise<string> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });

  if (!res.ok) {
    const body = await res.json().catch(() => undefined);
    throw new ApiError(body?.error ?? "เปิดไฟล์ไม่สำเร็จ", res.status);
  }

  return URL.createObjectURL(await res.blob());
}
