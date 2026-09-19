import type { PrismaClient } from "@prisma/client";

/**
 * คืนเลขจำนวนเต็มถัดไปใน sequence ที่ตั้งชื่อไว้แบบ atomic (เช่น "PRJ-2026")
 * ทำด้วย upsert แบบ `value = value + 1` ซึ่ง Postgres จะ serialize ผ่าน row lock
 * — ปลอดภัยเมื่อมีผู้เรียกพร้อมกันหลายราย ต่างจากการนับแถวที่มีอยู่
 */
export async function nextDocumentSequence(prisma: PrismaClient, counterId: string): Promise<number> {
  const counter = await prisma.documentCounter.upsert({
    where: { id: counterId },
    create: { id: counterId, value: 1 },
    update: { value: { increment: 1 } },
  });
  return counter.value;
}
