import { API_BASE, ApiError } from "./api";

// อัปโหลดแบบ multipart — ใช้ FormData ตรง ๆ (ไม่ใช้ apiFetch ที่บังคับ content-type เป็น JSON)
export async function uploadImage(file: File): Promise<{ url: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/uploads`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const body = await res.json().catch(() => undefined);
  if (!res.ok) {
    throw new ApiError(body?.error ?? "อัปโหลดไม่สำเร็จ", res.status, body?.details);
  }
  return body as { url: string };
}
