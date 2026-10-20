import type { CustomerDto } from "@systemboq/shared-types";

/**
 * แถวลูกค้าแบบย่อที่ส่งขึ้นหน้าจอ
 *
 * คอลัมน์ `User.email` ยอมให้ว่างได้ตั้งแต่พนักงานย้ายไปล็อกอินด้วย username แต่ **บัญชีลูกค้า
 * บังคับกรอกอีเมลทุกทางที่สร้างได้** (สมัครเอง · ทีมงานสร้างให้จากคำขอ · ลิงก์เข้าใช้) จึงไม่มี
 * เคสว่างจริง — `?? ""` ที่นี่คือการกันชนิดข้อมูล ไม่ใช่การเติมค่าปลอมให้ข้อมูลที่หายไป
 */
export function toCustomerDto(
  user: { id: string; email: string | null; fullName: string } | null,
): CustomerDto | null {
  if (!user) return null;
  return { id: user.id, email: user.email ?? "", fullName: user.fullName };
}
