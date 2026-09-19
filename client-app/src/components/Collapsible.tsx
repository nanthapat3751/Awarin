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
export function Collapsible({ open, children }: Readonly<{ open: boolean; children: ReactNode }>) {
  return (
    <div className={open ? "collapsible is-open" : "collapsible"}>
      <div inert={!open}>{children}</div>
    </div>
  );
}
