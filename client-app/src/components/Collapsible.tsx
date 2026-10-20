import type { ReactNode } from "react";

/**
 * ส่วนที่กางออก/พับเก็บได้แบบมีจังหวะ — ใช้กับของที่โผล่กลางฟอร์มแล้วดันเนื้อหาข้างล่างลงไป
 *
 * เนื้อหา "อยู่ในดอมเสมอ" (ไม่ได้ถอดออกตอนพับ) เพราะทรานซิชันต้องมีเฟรมเริ่มต้นให้ไล่ —
 * ผลข้างเคียงคือมันยังโฟกัสด้วย Tab ได้ทั้งที่มองไม่เห็น จึงต้องปิดด้วย `inert` ตอนพับ
 * (React 19 ส่ง inert ให้เป็น attribute จริง)
 *
 * ตัวที่ไม่อยากให้ทำงานก่อนเวลา เช่นวิดเจ็ต CAPTCHA ที่ต้องโหลดสคริปต์ข้างนอก ให้ใส่เงื่อนไข
 * mount ไว้ "ข้างใน" อีกที: <Collapsible open={x}>{x && <Widget />}</Collapsible>
 * ตัวครอบยังอยู่ในดอมตลอด ทรานซิชันจึงเล่นได้ตามปกติ
 *
 * รายละเอียด CSS อยู่ที่ .collapsible ใน index.css
 */
export function Collapsible({
  open,
  flush = false,
  children,
}: Readonly<{
  open: boolean;
  /**
   * ตอนพับ ตัวครอบติดลบ margin-bottom 1rem ไว้หักช่องว่าง gap-4 ของฟอร์ม (ไม่งั้นมีช่องว่างโหว่)
   * ที่ไม่ได้อยู่ในกล่อง gap ให้ใส่ flush — ไม่งั้นมันดึงขอบล่างของกล่องแม่ขึ้นมาทับเนื้อหาข้างบน
   * (การ์ดสัญญา: ปุ่ม "ดูรายละเอียดงวด" ชิดขอบล่าง)
   */
  flush?: boolean;
  children: ReactNode;
}>) {
  return (
    <div className={`collapsible${open ? " is-open" : ""}${flush ? " collapsible--flush" : ""}`}>
      <div inert={!open}>{children}</div>
    </div>
  );
}
