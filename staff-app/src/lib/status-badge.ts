// หน้าตาที่ใช้ร่วมกันของ pill สถานะทุกอันในแอปพนักงาน เพื่อให้โปรเจกต์ leads และ flag
// เผยแพร่/ร่าง อ่านเป็นระบบเดียวกัน สไตล์แบบ outline — ชิปสีขาว ขอบ + ตัวอักษรมีสี — ทำให้สี
// เป็นแค่จุดเน้นเบา ๆ และบน <select> ของ leads ทำให้เห็นชัดว่า pill เป็นตัวควบคุมที่คลิกได้
//
// JIT ของ Tailwind จะสร้าง class เฉพาะที่เห็นเป็น literal ในซอร์สเท่านั้น class สีทุกตัวจึงถูก
// เขียนเต็ม ๆ ในแมปด้านล่าง; ห้ามประกอบสตริงเหล่านี้จากตัวแปรสีเด็ดขาด

export type BadgeColor = "slate" | "amber" | "blue" | "indigo" | "emerald" | "red";

const BADGE_OUTLINE: Record<BadgeColor, string> = {
  slate: "border-slate-300 text-slate-500",
  amber: "border-amber-300 text-amber-700",
  blue: "border-blue-300 text-blue-700",
  indigo: "border-indigo-300 text-indigo-700",
  emerald: "border-emerald-300 text-emerald-700",
  red: "border-red-300 text-red-700",
};

// min-w + จัดข้อความกึ่งกลาง เพื่อให้ pill ทุกอันในคอลัมน์กว้างเท่ากันไม่ว่า label จะยาวแค่ไหน
// ("ร่าง" เทียบกับ "เสนอราคาแล้ว") เป็นความกว้างขั้นต่ำ ไม่ใช่ความกว้างตายตัว label ที่ยาวกว่า
// ในอนาคตจึงยังขยายได้แทนที่จะถูกตัด
const BADGE_BASE = "inline-block text-center min-w-[6.5rem] text-xs px-2 py-1 rounded-full border bg-white";

export function badgeClass(color: BadgeColor): string {
  return `${BADGE_BASE} ${BADGE_OUTLINE[color]}`;
}

/** ตัวช่วยสำหรับ flag เผยแพร่/ร่างจำนวนมาก (เขียวเมื่อเผยแพร่ เทาเมื่อเป็นร่าง) */
export function publishedBadgeClass(published: boolean): string {
  return badgeClass(published ? "emerald" : "slate");
}

/**
 * ปุ่มดาว "ขึ้นโชว์" ในตารางแบบบ้าน/ผลงาน — ติดดาวอยู่ · ครบโควตาแล้ว (กดไม่ได้) · ยังว่าง
 * `where` คือชื่อหน้าที่ของจะไปโชว์ เช่น "หน้าแรก" / "หน้าบริการ"
 */
export function featuredStar(
  featured: boolean,
  blocked: boolean,
  where: string,
  limit: number,
): { title: string; className: string } {
  if (featured) return { title: `เอาออกจาก${where}`, className: "text-amber-500 hover:text-amber-600" };
  if (blocked) return { title: `ครบ ${limit} แล้ว`, className: "cursor-not-allowed text-slate-300" };
  return { title: `แสดงใน${where}`, className: "text-slate-300 hover:text-amber-500" };
}
