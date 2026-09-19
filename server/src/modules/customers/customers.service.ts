import { prisma } from "../../lib/prisma";

// ค้นหาแบบง่าย ๆ ในบัญชี CUSTOMER ที่มีอยู่ — ใช้ผูกโปรเจกต์เข้ากับลูกค้าที่โปรเจกต์นั้นทำให้
// ไม่ใช่โมดูลจัดการลูกค้าเต็มรูปแบบ (ไม่มี create/edit ตรงนี้) บัญชีมาจากการสมัครเอง (client-app)
// หรือจาก Lead ที่กลายเป็นลูกค้า และยังจับคู่ด้วยเบอร์โทรใน profile ด้วย เพื่อให้การเติมช่องเลือก
// ล่วงหน้าด้วยเบอร์ของ lead ดึงบัญชีที่ลงทะเบียนไว้แล้วขึ้นมา (auto-match ไอเดียที่ 2)
export async function searchCustomers(q?: string) {
  return prisma.user.findMany({
    where: {
      role: "CUSTOMER",
      // บัญชีที่ถูกระงับหรือลูกค้าขอลบไปแล้ว ต้องไม่โผล่ให้เลือกผูกโครงการใหม่
      // (ก่อนมีปุ่มระงับบัญชี เงื่อนไขนี้ไม่มีผล เพราะไม่มีทางที่ลูกค้าจะ active=false ได้เลย)
      active: true,
      OR: q
        ? [
            { fullName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { customerProfile: { phone: { contains: q } } },
          ]
        : undefined,
    },
    select: { id: true, email: true, fullName: true },
    orderBy: { fullName: "asc" },
    take: 20,
  });
}
