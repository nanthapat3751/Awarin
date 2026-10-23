import request from "supertest";

import { app } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { createAndLoginOwner } from "../helpers/test-auth";

/**
 * gzip ตามที่ผู้ขอรองรับ (Accept-Encoding) — performance test รอบ 1 พบว่าคำตอบก้อนใหญ่ (BOQ / โครงการ /
 * คลังวัสดุ 50–70 KB) ช้าสุด และทั้งระบบไม่มีการบีบอัดเลย · supertest แตกไฟล์ให้เอง จึงอ่าน body ได้ตามปกติ
 */
describe("บีบอัดคำตอบ (gzip)", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-compression-owner");
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: owner.userId } });
    await prisma.$disconnect();
  });

  it("คำตอบใหญ่ถูกบีบอัดเมื่อผู้ขอรองรับ gzip และเนื้อหายังอ่านได้ครบ", async () => {
    // ข้อมูลหน้าแม่แบบสัญญาเริ่มต้น (ข้อความสัญญาทั้งฉบับ) ใหญ่เกิน 1 KB เสมอ ไม่ขึ้นกับข้อมูลในฐานทดสอบ
    const res = await owner.agent.get("/api/contract-templates").set("Accept-Encoding", "gzip");
    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBe("gzip");
    expect(res.headers["vary"]).toMatch(/Accept-Encoding/i);
    expect(Array.isArray(res.body.templates ?? res.body)).toBe(true);
  });

  it("ผู้ขอที่ไม่รองรับ gzip ได้คำตอบแบบไม่บีบอัด", async () => {
    const res = await owner.agent.get("/api/contract-templates").set("Accept-Encoding", "identity");
    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBeUndefined();
  });

  it("คำตอบเล็ก (ต่ำกว่า 1 KB) ไม่บีบอัด — เปลือง CPU มากกว่าที่ประหยัดได้", async () => {
    const res = await request(app).get("/api/health").set("Accept-Encoding", "gzip");
    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBeUndefined();
  });
});
