import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type AuthMode = "login" | "register";

/**
 * การ์ดเข้าสู่ระบบ/สมัครสมาชิก — แผ่นสีนาวีเฉียง ("ใบมีด") เลื่อนข้ามฝั่งเมื่อสลับโหมด
 *
 * **ทำไมต้องเป็นการ์ดใบเดียวสองโหมด** อนิเมชันใบมีดเกิดขึ้นได้ก็ต่อเมื่อ DOM ตัวเดิมยังอยู่
 * ถ้า /login กับ /register เป็นคนละ Route ระดับบน React จะถอดการ์ดทิ้งแล้วสร้างใหม่ ใบมีดจะ
 * "โผล่" ที่ปลายทางเลยโดยไม่มีการเลื่อน — App.tsx จึงครอบสองเส้นทางนี้ไว้ใน Route แม่ที่ไม่มี path
 *
 * **ใบมีดทำด้วย clip-path ไม่ใช่ transform** เพราะรูปทรงต้องเปลี่ยนด้วย ไม่ใช่แค่ย้ายที่: ตอนอยู่
 * ซ้ายขอบเฉียงอยู่ทางขวา ตอนอยู่ขวาขอบเฉียงอยู่ทางซ้าย · polygon ทั้งสองมี 4 จุดเท่ากัน
 * เบราว์เซอร์จึงไล่ค่าระหว่างกันได้เป็นการกวาดข้ามจอ (ถ้าจำนวนจุดไม่เท่ากันจะกระโดดทันที)
 *
 * **ความสูงต้องวัดเอง** ฟอร์มเข้าสู่ระบบมี 2 ช่อง ฟอร์มสมัครมี 5 ช่อง ต่างกันเกือบ 250px
 * ปล่อยไว้การ์ดจะกระตุกสูงขึ้นทันทีที่สลับ — จึงวัดความสูงจริงของเนื้อในแล้วไล่ค่าความสูงของ
 * การ์ดตามไปพร้อมกับใบมีด · วัดที่ลูกซึ่งความสูงเป็นอิสระจากการ์ด จึงไม่เกิดลูปวัด-แล้ว-ดันกัน
 */
export function AuthBlade({
  mode,
  aside,
  children,
}: Readonly<{ mode: AuthMode; aside: ReactNode; children: ReactNode }>) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    // เนื้อในสูงเปลี่ยนได้เองระหว่างอยู่โหมดเดิม (ข้อความผิดพลาดโผล่ · แถบความแข็งแรงรหัสผ่าน ·
    // กล่องนับถอยหลังตอนบัญชีถูกล็อก) ไม่ใช่แค่ตอนสลับโหมด
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [mode]);

  // ใบมีดอยู่ฝั่งเดียวกับแผงประโยชน์เสมอ — สมัคร = ซ้าย (ตามแบบ) · เข้าสู่ระบบ = ขวา
  const asideOrder = mode === "register" ? "md:order-1" : "md:order-2";
  const formOrder = mode === "register" ? "md:order-2" : "md:order-1";

  return (
    <div
      className={`auth-card auth-blade auth-blade--${mode} relative isolate w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 shadow-card`}
      // ก่อนวัดครั้งแรกปล่อยเป็น auto — ถ้าใส่ 0 ไปก่อนจะเห็นการ์ดแบนแล้วกางออกตอนเปิดหน้า
      style={height === null ? undefined : { height }}
    >
      <span aria-hidden className="blade-seam" />
      <span aria-hidden className="blade-body" />
      <div ref={bodyRef} className="relative z-10 grid md:grid-cols-2 md:items-center">
        {/* บนมือถือฟอร์มมาก่อนเสมอ (order-1) — คนที่เข้ามาล็อกอินซ้ำไม่ต้องเลื่อนผ่านคำโฆษณา
            และใบมีดถูกซ่อน (เฉียงที่ความกว้าง 390px อ่านไม่ออก) แผงนี้จึงต้องมีพื้นนาวีของตัวเอง */}
        <div className={`auth-aside order-2 bg-brand p-8 md:bg-transparent ${asideOrder}`}>
          {aside}
        </div>
        <div className={`order-1 p-8 ${formOrder}`}>{children}</div>
      </div>
    </div>
  );
}
