import { useEffect, useState } from "react";

/**
 * ไฟล์ที่ API เสิร์ฟแบบตรวจสิทธิ์ (สลิป/หลักฐานการรับเงิน) → object URL สำหรับ <img>/<iframe>
 *
 * ชี้ src ไปที่ API ตรง ๆ ไม่ได้: API อยู่คนละพอร์ต รูปถูก Cross-Origin-Resource-Policy ของ helmet บล็อก
 * และการโหลดแบบนั้นไม่ส่ง Origin ให้ API ผูก session — จึง fetch พร้อมคุกกี้แล้วทำเป็น blob เอง
 * (วิธีเดียวกับ fetchPdfObjectUrl ของหน้าดูเอกสาร)
 *
 * เก็บ blob ไว้ใช้ซ้ำในหน้าเดียว — รูปย่อในกล่องกับรูปใหญ่ในหน้าต่างตรวจเป็นไฟล์เดียวกัน ไม่ต้องโหลดสองรอบ
 * เพดาน 24 ไฟล์ (สลิปไฟล์ละไม่เกิน 10 MB) ตัวเก่าสุดหลุดก่อน · โหลดพังไม่จำ ให้ลองใหม่ได้
 */
const MAX_CACHED = 24;
const cache = new Map<string, Promise<Blob>>();

export function fetchAuthedBlob(url: string): Promise<Blob> {
  const hit = cache.get(url);
  if (hit) return hit;
  const pending = fetch(url, { credentials: "include" }).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.blob();
  });
  pending.catch(() => cache.delete(url));
  cache.set(url, pending);
  if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
  return pending;
}

/** object URL ของไฟล์ (แยกต่อผู้ใช้ — คืนหน่วยความจำเองตอนเลิกใช้) · src = null ระหว่างโหลด */
export function useAuthedFile(url: string | null): { src: string | null; error: boolean } {
  const [state, setState] = useState<{ src: string | null; error: boolean }>({ src: null, error: false });

  useEffect(() => {
    if (!url) return;
    let alive = true;
    let objectUrl: string | null = null;
    setState({ src: null, error: false });
    fetchAuthedBlob(url)
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ src: objectUrl, error: false });
      })
      .catch(() => {
        if (alive) setState({ src: null, error: true });
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return state;
}

export function isPdfName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".pdf");
}
