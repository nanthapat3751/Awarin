import type { Role } from "@systemboq/shared-types";

/** ชื่อบทบาทเต็มที่แสดงกับเจ้าของบัญชีเอง (เมนูผู้ใช้ · หน้าบัญชีของฉัน) */
export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "เจ้าของระบบ",
  ADMIN: "ผู้ดูแลระบบ",
  CUSTOMER: "ลูกค้า",
};
