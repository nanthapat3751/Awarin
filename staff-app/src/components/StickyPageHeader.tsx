import type { ReactNode } from "react";

/**
 * แถบหัวหน้าที่ติดอยู่บนจอเมื่อเลื่อนพ้นหัวเรื่องจริง (คู่กับ useStuckPastHeader)
 *
 * ทำไมต้องมี: หน้ารายละเอียดโครงการยาวได้ถึง ~7,000px (BOQ 89 รายการ = เกือบ 8 หน้าจอ)
 * พอเลื่อนลงไปแก้ราคาลึก ๆ จะไม่เหลืออะไรบอกว่ากำลังอยู่โครงการไหน สถานะอะไร
 *
 * วิธีทำที่ไม่ทำให้หน้ากระตุก: ตัวห่อเป็น sticky สูง 0 (ไม่กินที่ในสายงาน) แล้วให้แถบข้างในล้นออกมา
 * ทับเนื้อหา — ถ้าใช้ sticky ที่มีความสูงจริงแล้วสลับซ่อน/แสดง หน้าจะกระโดดทุกครั้งที่แถบโผล่
 *
 * z-30 เท่ากับดรอปดาวน์ (UnitSelect/UserMenu) โดยตั้งใจ — แถบอยู่ก่อนใน DOM ดรอปดาวน์จึงชนะ
 * ไม่มีทางที่ตัวเลือกจะถูกแถบบัง แต่ยังอยู่ใต้ modal (z-50) และ toast (z-60)
 */
export function StickyPageHeader({ show, children }: Readonly<{ show: boolean; children: ReactNode }>) {
  return (
    <div className="sticky top-0 z-30 h-0">
      {/* overflow-hidden กันเนื้อหาในแถบดันความกว้างของทั้งหน้า: ลูก ๆ มักเป็น shrink-0 กันหมด
          (ตัวเลข/ป้ายสถานะย่อไม่ได้) พอจอแคบกว่าผลรวมของมัน หน้าจะเลื่อนแนวนอนได้ทั้งที่แถบยังซ่อนอยู่ */}
      <div
        className={`-mx-6 flex h-12 items-center gap-3 overflow-hidden border-b border-slate-200 bg-white px-6 transition-opacity duration-150 ${
          show ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
