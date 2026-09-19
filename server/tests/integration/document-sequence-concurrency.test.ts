import { nextDocumentSequence } from "../../src/lib/document-sequence";
import { prisma } from "../../src/lib/prisma";

// พิสูจน์ว่า nextDocumentSequence() ปลอดภัยจาก race จริงภายใต้การทำงานพร้อมกันจริง ไม่ใช่แค่
// "ผ่านเพราะชุดเทสต์ด้านนอกบังเอิญรันด้วย maxWorkers: 1" เทสต์นี้ยิงผู้เรียก 20 รายพร้อมกันไปที่
// แถว counter แถวเดียวกัน ภายในเทสต์ Jest ตัวเดียว (Node process/worker เดียว) ผ่าน Promise.all
// — การตั้งค่าขนานข้ามไฟล์ของ Jest ไม่เกี่ยวกับเรื่องนี้ การทำงานพร้อมกันตรงนี้เกิดจริง ใน
// process เดียว เป็นการเรียก DB พร้อมกันจริง ๆ
describe("nextDocumentSequence concurrency", () => {
  const CONCURRENCY = 20;
  const ROUNDS = 3;
  const counterIds: string[] = [];

  afterAll(async () => {
    await prisma.documentCounter.deleteMany({ where: { id: { in: counterIds } } });
    await prisma.$disconnect();
  });

  it.each(Array.from({ length: ROUNDS }, (_, i) => i + 1))(
    "round %i: issues %i unique, contiguous sequence numbers under real concurrency",
    async (round) => {
      const counterId = `TEST-CONCURRENCY-${Date.now()}-${round}-${Math.random().toString(36).slice(2, 8)}`;
      counterIds.push(counterId);

      const results = await Promise.all(
        Array.from({ length: CONCURRENCY }, () => nextDocumentSequence(prisma, counterId)),
      );

      const uniqueValues = new Set(results);
      expect(uniqueValues.size).toBe(CONCURRENCY); // (a) no duplicates

      const sorted = [...results].sort((a, b) => a - b);
      const expectedContiguous = Array.from({ length: CONCURRENCY }, (_, i) => i + 1);
      expect(sorted).toEqual(expectedContiguous); // (b) no gaps — exactly 1..20

      // eslint-disable-next-line no-console
      console.log(
        `[document-sequence-concurrency] round ${round}: ${CONCURRENCY} concurrent calls -> ` +
          `unique values ${sorted[0]}..${sorted[sorted.length - 1]} (${uniqueValues.size} distinct)`,
      );
    },
  );
});
