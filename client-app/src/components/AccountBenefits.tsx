import type { ReactNode } from "react";

// แผงอธิบายว่า "บัญชีลูกค้าใช้ทำอะไร" — ใช้ร่วมกันบนหน้าเข้าสู่ระบบและสมัครสมาชิก เพื่อให้คนที่ยัง
// ไม่ล็อกอินเข้าใจคุณค่าก่อนตัดสินใจ (แก้ปัญหา "ปุ่มเข้าสู่ระบบมีแต่โชว์ ไม่รู้ว่าเข้าไปทำอะไรได้")
//
// อยู่บนใบมีดสีนาวีเสมอ สีตัวอักษรจึงเป็นชุดสว่างตายตัว ไม่ทำเป็นตัวเลือก — ถ้าวันหนึ่งต้องเอาไป
// วางบนพื้นขาว ค่อยเพิ่มตัวเลือกตอนนั้น ดีกว่าแบกตัวเลือกที่ไม่มีใครใช้ไว้ก่อน
//
// หัวข้อกับคำโปรยรับมาจากข้างนอก เพราะเปลี่ยนตามโหมด (กลับมาเข้าระบบ vs เพิ่งจะสมัคร) ส่วน
// รายการประโยชน์เหมือนกันทั้งสองโหมด — สิ่งที่บัญชีทำได้ไม่ได้ขึ้นกับว่ามาถึงหน้านี้ด้วยทางไหน
const BENEFITS: { title: string; desc: string }[] = [
  { title: "ดูใบเสนอราคา", desc: "เปิดดูราคาและรายละเอียดงานได้ทุกเมื่อ" },
  { title: "ติดตามสถานะคำขอและโครงการ", desc: "รู้ว่างานของคุณอยู่ในขั้นตอนไหน" },
  { title: "เก็บสัญญาและเอกสาร", desc: "ดาวน์โหลดเอกสารทั้งหมดได้จากที่เดียว" },
  { title: "รับการแจ้งเตือน", desc: "มีอัปเดตใหม่แจ้งให้ทราบทันที" },
];

export function AccountBenefits({
  title,
  subtitle,
}: Readonly<{ title: ReactNode; subtitle: string }>) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        {/* ตัวเอนคำท้ายตามแบบ — เน้นคำสุดท้ายโดยไม่ต้องเพิ่มสีที่สามเข้ามาในการ์ด */}
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/50">Awarin</p>
        <h2 className="mt-2 text-2xl font-semibold leading-tight text-white">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/70">{subtitle}</p>
      </div>
      <ul className="flex flex-col gap-3.5">
        {BENEFITS.map((b) => (
          <li key={b.title} className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.3 3.29 6.8-6.8a1 1 0 0 1 1.4 0Z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
            <div>
              <p className="text-sm font-medium text-white">{b.title}</p>
              <p className="mt-0.5 text-xs text-white/60">{b.desc}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
