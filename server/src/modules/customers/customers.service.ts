import { prisma } from "../../lib/prisma";

// ค้นหาแบบง่าย ๆ ในบัญชี CUSTOMER ที่มีอยู่ — ใช้ผูกโปรเจกต์เข้ากับลูกค้าที่โปรเจกต์นั้นทำให้
// ไม่ใช่โมดูลจัดการลูกค้าเต็มรูปแบบ (ไม่มี create/edit ตรงนี้) บัญชีมาจากการสมัครเอง (client-app)
// หรือจาก Lead ที่กลายเป็นลูกค้า และยังจับคู่ด้วยเบอร์โทรใน profile ด้วย เพื่อให้การเติมช่องเลือก
// ล่วงหน้าด้วยเบอร์ของ lead ดึงบัญชีที่ลงทะเบียนไว้แล้วขึ้นมา (auto-match ไอเดียที่ 2)
const PICK_SELECT = {
  id: true,
  email: true,
  fullName: true,
  avatarUrl: true,
  customerProfile: { select: { phone: true } },
} as const;

const PICK_LIMIT = 20;
const RECENT_LIMIT = 8;

type PickRow = { id: string; email: string | null; fullName: string; avatarUrl: string | null; customerProfile: { phone: string | null } | null };
const toPick = (u: PickRow) => ({ id: u.id, email: u.email, fullName: u.fullName, avatarUrl: u.avatarUrl, phone: u.customerProfile?.phone ?? null });

/**
 * ช่องเลือกลูกค้าในหน้าโครงการ — แสดงเบอร์/รูปด้วย (ชื่อซ้ำกันแยกได้)
 * ไม่พิมพ์อะไร = "ล่าสุด": ลูกค้าของโครงการที่แก้ล่าสุดก่อน แล้วต่อด้วยบัญชีที่สมัครล่าสุด
 * (เดิมเรียงตามชื่อ ก-ฮ 20 คนแรก ซึ่งไม่ใช่คนที่พนักงานน่าจะหาเลย)
 */
export async function searchCustomers(q?: string) {
  // บัญชีที่ถูกระงับหรือลูกค้าขอลบไปแล้ว ต้องไม่โผล่ให้เลือกผูกโครงการใหม่
  const base = { role: "CUSTOMER" as const, active: true };
  const term = q?.trim();
  if (term) {
    const rows = await prisma.user.findMany({
      where: {
        ...base,
        OR: [
          { fullName: { contains: term, mode: "insensitive" } },
          { email: { contains: term, mode: "insensitive" } },
          { customerProfile: { phone: { contains: term } } },
        ],
      },
      select: PICK_SELECT,
      orderBy: { fullName: "asc" },
      take: PICK_LIMIT,
    });
    return rows.map(toPick);
  }

  const recentProjects = await prisma.project.findMany({
    where: { deletedAt: null, customerId: { not: null }, customer: base },
    orderBy: { updatedAt: "desc" },
    distinct: ["customerId"],
    select: { customerId: true },
    take: RECENT_LIMIT,
  });
  const recentIds = recentProjects.map((p) => p.customerId!);
  const [recent, newest] = await Promise.all([
    prisma.user.findMany({ where: { ...base, id: { in: recentIds } }, select: PICK_SELECT }),
    prisma.user.findMany({
      where: { ...base, id: { notIn: recentIds } },
      select: PICK_SELECT,
      orderBy: { createdAt: "desc" },
      take: Math.max(0, RECENT_LIMIT - recentIds.length),
    }),
  ]);
  const byId = new Map(recent.map((u) => [u.id, u]));
  return [...recentIds.flatMap((id) => byId.get(id) ?? []), ...newest].map(toPick);
}
