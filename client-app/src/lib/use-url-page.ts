import { useRef } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * เลขหน้าของตะแกรงการ์ดหน้าสาธารณะ (แบบบ้าน / ผลงาน) เก็บใน URL (?page=2) — เปิดการ์ดดูรายละเอียด
 * แล้วกดย้อนกลับจะกลับมาหน้าเดิม ไม่เด้งไปหน้า 1 · เปลี่ยนหน้าแล้วเลื่อนขึ้นหัวตะแกรง (เผื่อแถบเมนูที่ติดบนจอ)
 */
export function useUrlPage() {
  const [params, setParams] = useSearchParams();
  const topRef = useRef<HTMLDivElement>(null);
  const page = Math.max(1, Math.floor(Number(params.get("page"))) || 1);

  function setPage(next: number, { scroll = true } = {}) {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next <= 1) p.delete("page");
        else p.set("page", String(next));
        return p;
      },
      // ล้างกลับหน้า 1 ตอนเปลี่ยนตัวกรองไม่ใช่การเดินหน้า — ไม่ต้องเพิ่มประวัติ
      { replace: !scroll },
    );
    if (!scroll || !topRef.current) return;
    const navH =
      Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue("--nav-h"), 10) || 64;
    const top = topRef.current.getBoundingClientRect().top + window.scrollY - navH - 16;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }

  return { page, setPage, topRef };
}
