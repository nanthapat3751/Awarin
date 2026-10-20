import { Link, useLocation } from "react-router-dom";
import { usePageMeta } from "../lib/page-meta";

/**
 * หน้าปลายทางของ URL ที่ไม่ตรงกับเส้นทางไหนเลย (ฝั่งลูกค้า)
 *
 * ทำไมต้องมี: ที่นี่มี NavBar/Footer ห่อ <Routes> อยู่แล้ว URL ที่ไม่ตรงจึงไม่ได้ขาวทั้งจอเหมือน
 * ฝั่งพนักงาน แต่ได้แถบเมนูบน + ฟุตเตอร์ โดยที่ตรงกลางว่างเปล่า — ดูเหมือนหน้าโหลดค้างหรือเว็บเสีย
 * ซึ่งแย่กว่าการบอกไปตรง ๆ ว่าไม่มีหน้านี้
 *
 * จงใจไม่ใส่แถวลิงก์ "แบบบ้าน/ผลงาน/บริการ/ติดต่อเรา" ไว้ในหน้านี้ — แถบเมนูด้านบนกับฟุตเตอร์
 * มีชุดเดียวกันอยู่แล้วทั้งคู่ ใส่อีกชุดจะกลายเป็นเมนูเดิมซ้ำสามรอบในจอเดียว
 */
export function NotFoundPage() {
  usePageMeta("ไม่พบหน้านี้");
  const { pathname } = useLocation();

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-20 text-center">
      <p className="text-sm font-medium tracking-widest text-brand">404</p>
      <h1 className="mt-3 text-2xl font-semibold text-slate-800 sm:text-3xl">ไม่พบหน้าที่คุณเปิด</h1>
      <p className="mx-auto mt-3 max-w-md leading-relaxed text-slate-600">
        ที่อยู่นี้อาจพิมพ์ผิด หรือเป็นลิงก์เก่าที่ย้ายไปแล้ว เลือกจากเมนูด้านบนเพื่อไปต่อได้เลย
      </p>
      {/* ตัวป้ายเป็น inline-block ให้กว้างพอดีข้อความ — ถ้ากว้างเต็มความกว้างจะดูเหมือนช่องกรอกข้อมูล */}
      <p className="mt-4">
        <span className="inline-block max-w-md truncate rounded-md bg-slate-50 px-3 py-1.5 align-middle text-xs text-slate-500">
          {pathname}
        </span>
      </p>

      <Link
        to="/"
        className="mt-8 inline-flex min-h-11 items-center justify-center rounded-md bg-brand px-5 py-2.5 font-medium text-white transition-colors hover:bg-brand-dark"
      >
        กลับหน้าแรก
      </Link>
    </div>
  );
}
