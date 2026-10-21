import { prisma } from "../../src/lib/prisma";
import { createAndLoginOwner, createCustomerDirect } from "../helpers/test-auth";

/**
 * อัปโหลดรูปโปรไฟล์/ลายเซ็นที่ใช้ไม่ได้ — ต้องได้ 400 พร้อมบอกเหตุผลที่ผู้ใช้แก้เองได้
 * (ชนิดไฟล์ · ขนาด · ไม่ได้แนบไฟล์ · ไฟล์เสียเปิดเป็นรูปไม่ได้) และต้องไม่มีอะไรถูกบันทึก
 * เส้นทางที่อัปโหลดสำเร็จมีเทสต์ของตัวเองใน account.test.ts / customer-profile-avatar.test.ts
 */
describe("avatar and signature upload errors", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let customer: Awaited<ReturnType<typeof createCustomerDirect>>;

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-upload-errors-owner");
    customer = await createCustomerDirect("test-upload-errors-cust");
  });

  afterAll(async () => {
    const ids = [owner.userId, customer.userId];
    await prisma.session.deleteMany({ where: { userId: { in: ids } } });
    await prisma.customerProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  const fakePng = Buffer.from("this is not really a png");

  describe.each([
    ["staff avatar", () => owner.agent, "/api/account/avatar", "ไฟล์ใหญ่เกิน 5 MB", 5],
    ["customer avatar", () => customer.agent, "/api/auth/me/avatar", "ไฟล์ใหญ่เกิน 5 MB", 5],
    ["staff signature", () => owner.agent, "/api/account/signature", "ไฟล์ใหญ่เกิน 8 MB", 8],
  ] as const)("%s", (_label, agentOf, url, tooBig, limitMb) => {
    it("rejects a request without a file", async () => {
      const res = await agentOf().post(url);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/^ไม่พบไฟล์/);
    });

    it("rejects a file type other than JPEG / PNG / WEBP", async () => {
      const res = await agentOf()
        .post(url)
        .attach("file", Buffer.from("GIF89a"), { filename: "x.gif", contentType: "image/gif" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("รองรับเฉพาะไฟล์ JPEG / PNG / WEBP");
    });

    it(`rejects a file larger than ${limitMb} MB`, async () => {
      const res = await agentOf()
        .post(url)
        .attach("file", Buffer.alloc(limitMb * 1024 * 1024 + 1), { filename: "big.png", contentType: "image/png" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe(tooBig);
    });

    it("rejects a file that claims to be an image but cannot be read as one", async () => {
      const res = await agentOf().post(url).attach("file", fakePng, { filename: "broken.png", contentType: "image/png" });
      expect(res.status).toBe(400);
      expect(typeof res.body.error).toBe("string");
    });
  });

  it("leaves the account without a picture or signature after the failed uploads", async () => {
    const staff = await prisma.user.findUniqueOrThrow({ where: { id: owner.userId } });
    expect(staff.avatarUrl).toBeNull();
    expect((await owner.agent.get("/api/account/signature")).body.signature).toEqual({ dataUrl: null, updatedAt: null });
    const cust = await prisma.user.findUniqueOrThrow({ where: { id: customer.userId } });
    expect(cust.avatarUrl).toBeNull();
  });
});
