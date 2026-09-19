import { FileQuestion } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { buttonClasses } from "../components/Button";
import { Layout } from "../components/Layout";
import { PageHeader } from "../components/PageHeader";

/**
 * หน้าปลายทางของ URL ที่ไม่ตรงกับเส้นทางไหนเลย
 *
 * ทำไมต้องมี: react-router ที่ไม่มี route ตัวรับท้าย (path="*") จะไม่เรนเดอร์อะไรเลยเมื่อไม่มี
 * เส้นทางไหนตรง — ได้จอขาวล้วน ไม่มีแม้แต่เมนูข้าง ไม่มีข้อความบอกสาเหตุ ผู้ใช้ที่พิมพ์ที่อยู่ผิด
 * หรือเปิดจาก bookmark เก่าจะเข้าใจว่าระบบพัง
 *
 * โชว์ที่อยู่ที่เปิดมาด้วย เพื่อให้เห็นเองว่าพิมพ์ตกตรงไหน (เช่น /setting ที่ตกตัว s)
 */
export function NotFoundPage() {
  const { pathname } = useLocation();

  return (
    <Layout>
      <PageHeader title="ไม่พบหน้านี้" subtitle="ที่อยู่ที่เปิดมาไม่ตรงกับหน้าใดในระบบ" />

      <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <FileQuestion size={28} className="mx-auto mb-3 text-slate-300" />
        <p className="font-medium text-slate-700">ไม่พบหน้าที่ตรงกับที่อยู่นี้</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          อาจพิมพ์ที่อยู่ผิด หรือมาจากลิงก์เก่าที่ย้ายไปแล้ว — เลือกเมนูทางซ้ายเพื่อไปต่อได้เลย
        </p>
        {/* กล่องชั้นนอกเป็น block เพื่อคุมระยะห่างจากปุ่มด้านล่าง ส่วนตัวป้ายเป็น inline-block ให้
            กว้างพอดีข้อความ — ถ้าปล่อยกว้างเต็ม max-w-md จะดูเหมือนช่องกรอกข้อมูล */}
        <p className="mt-3">
          <span className="inline-block max-w-md truncate rounded-md bg-slate-50 px-3 py-1.5 align-middle text-xs text-slate-500">
            {pathname}
          </span>
        </p>
        <Link to="/" className={`mt-5 ${buttonClasses("secondary")}`}>
          กลับไปแดชบอร์ด
        </Link>
      </div>
    </Layout>
  );
}
