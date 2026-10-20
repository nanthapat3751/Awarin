import "../src/env";

import { prisma } from "../src/lib/prisma";
import { createStaffRecoveryLink } from "../src/modules/auth/password-reset.service";

/**
 * กู้บัญชีพนักงานจากเครื่องเซิร์ฟเวอร์ — ทางสุดท้ายเมื่อ OWNER คนเดียวของระบบลืมรหัสผ่าน
 * และยังไม่ได้ยืนยันอีเมลกู้รหัสไว้ (ถ้ามี OWNER อีกคน ให้คนนั้นรีเซ็ตให้ที่หน้าจัดการผู้ใช้แทน)
 *
 *   npm run staff:recover -w server -- <ชื่อผู้ใช้>
 *
 * ได้ลิงก์ตั้งรหัสใหม่ (ใช้ได้ 30 นาที ครั้งเดียว) เปิดในเบราว์เซอร์แล้วตั้งรหัสเอง
 * ถ้าเปิดยืนยันตัวตน 2 ชั้นไว้ ยังต้องใช้แอปหรือรหัสสำรองตอนเข้าระบบเหมือนเดิม
 */
async function main() {
  const username = process.argv[2];
  if (!username) {
    console.error("ใส่ชื่อผู้ใช้ด้วย เช่น  npm run staff:recover -w server -- owner");
    process.exitCode = 1;
    return;
  }
  const { url, fullName, role } = await createStaffRecoveryLink(username);
  console.log(`บัญชี: ${fullName} (${role})`);
  console.log("ลิงก์ตั้งรหัสผ่านใหม่ — ใช้ได้ 30 นาที ครั้งเดียว:");
  console.log(url);
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
