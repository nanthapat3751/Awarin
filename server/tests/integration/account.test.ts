import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";
import request from "supertest";

import { app } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { UPLOADS_DIR } from "../../src/modules/uploads/uploads.routes";
import { createAndLoginAdmin, createAndLoginCustomer } from "../helpers/test-auth";

/** หน้า "บัญชีของฉัน" ของพนักงาน — โปรไฟล์ + รูปโปรไฟล์ */
describe("staff account (my profile + avatar)", () => {
  let admin: Awaited<ReturnType<typeof createAndLoginAdmin>>;
  const createdUserIds: string[] = [];
  const createdCustomerEmails: string[] = [];

  beforeAll(async () => {
    admin = await createAndLoginAdmin("test-account-admin");
    createdUserIds.push(admin.userId);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { email: { in: createdCustomerEmails } } });
    await prisma.$disconnect();
  });

  /** ชื่อไฟล์บนดิสก์จาก avatarUrl (ส่งออกเป็น URL เต็มแล้ว) */
  const fileOf = (url: string) => path.join(UPLOADS_DIR, url.split("/uploads/")[1]);

  /** รูป JPEG จริงขนาดไม่จัตุรัส พร้อม EXIF ที่ต้องไม่หลุดไปถึงไฟล์ที่เก็บ */
  const photo = () =>
    sharp({ create: { width: 800, height: 600, channels: 3, background: "#336699" } })
      .withExif({ IFD0: { Copyright: "exif-must-be-stripped" } })
      .jpeg()
      .toBuffer();

  it("updates own name, job title and work phone; blank optional fields become null", async () => {
    const res = await admin.agent
      .patch("/api/account/profile")
      .send({ fullName: "  สมหญิง ทดสอบ ", jobTitle: "วิศวกรประเมินราคา", workPhone: "081-234-5678" });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      fullName: "สมหญิง ทดสอบ",
      jobTitle: "วิศวกรประเมินราคา",
      workPhone: "081-234-5678",
    });

    const me = await admin.agent.get("/api/auth/me");
    expect(me.body.user.jobTitle).toBe("วิศวกรประเมินราคา");

    const cleared = await admin.agent
      .patch("/api/account/profile")
      .send({ fullName: "สมหญิง ทดสอบ", jobTitle: "   ", workPhone: "" });
    expect(cleared.body.user.jobTitle).toBeNull();
    expect(cleared.body.user.workPhone).toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { userId: admin.userId, action: "PROFILE_UPDATED" },
    });
    expect(audit).not.toBeNull();
  });

  it("rejects an empty name and a phone without enough digits", async () => {
    const noName = await admin.agent
      .patch("/api/account/profile")
      .send({ fullName: "  ", jobTitle: null, workPhone: null });
    expect(noName.status).toBe(400);

    const badPhone = await admin.agent
      .patch("/api/account/profile")
      .send({ fullName: "ชื่อ", jobTitle: null, workPhone: "โทรหาได้" });
    expect(badPhone.status).toBe(400);
  });

  it("cannot set email, role or avatarUrl through the profile endpoint", async () => {
    const res = await admin.agent.patch("/api/account/profile").send({
      fullName: "ชื่อ",
      jobTitle: null,
      workPhone: null,
      email: "hijack@example.com",
      role: "OWNER",
      avatarUrl: "https://evil.example/x.png",
    });
    expect(res.status).toBe(200);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: admin.userId } });
    expect(row.email).toBe(admin.email);
    expect(row.role).toBe("ADMIN");
    expect(row.avatarUrl).toBeNull();
  });

  it("re-encodes an uploaded photo to a 256×256 WebP with no EXIF, and replaces the old file", async () => {
    const first = await admin.agent.post("/api/account/avatar").attach("file", await photo(), {
      filename: "me.jpg",
      contentType: "image/jpeg",
    });
    expect(first.status).toBe(201);
    const firstUrl: string = first.body.user.avatarUrl;
    expect(firstUrl).toMatch(/^https?:\/\/[^/]+\/uploads\/avatar-[\w-]+\.webp$/);

    const meta = await sharp(fs.readFileSync(fileOf(firstUrl))).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 256, height: 256 });
    expect(meta.exif).toBeUndefined();

    const second = await admin.agent.post("/api/account/avatar").attach("file", await photo(), {
      filename: "me2.jpg",
      contentType: "image/jpeg",
    });
    const secondUrl: string = second.body.user.avatarUrl;
    expect(secondUrl).not.toBe(firstUrl);
    expect(fs.existsSync(fileOf(firstUrl))).toBe(false);
    expect(fs.existsSync(fileOf(secondUrl))).toBe(true);
  });

  it("rejects a file that only claims to be an image and leaves the current avatar alone", async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: admin.userId } });
    const filesBefore = fs.readdirSync(UPLOADS_DIR).length;

    const res = await admin.agent
      .post("/api/account/avatar")
      .attach("file", Buffer.from("<script>alert(1)</script>"), {
        filename: "evil.png",
        contentType: "image/png",
      });
    expect(res.status).toBe(400);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: admin.userId } });
    expect(after.avatarUrl).toBe(before.avatarUrl);
    expect(fs.readdirSync(UPLOADS_DIR).length).toBe(filesBefore);
  });

  it("removes the avatar and its file", async () => {
    const { avatarUrl } = await prisma.user.findUniqueOrThrow({ where: { id: admin.userId } });
    expect(avatarUrl).not.toBeNull();

    const res = await admin.agent.delete("/api/account/avatar");
    expect(res.status).toBe(200);
    expect(res.body.user.avatarUrl).toBeNull();
    expect(fs.existsSync(path.join(UPLOADS_DIR, avatarUrl!.replace("/uploads/", "")))).toBe(false);
  });

  it("is staff-only", async () => {
    const customer = await createAndLoginCustomer("test-account-customer");
    createdCustomerEmails.push(customer.email);
    const asCustomer = await customer.agent
      .patch("/api/account/profile")
      .send({ fullName: "x", jobTitle: null, workPhone: null });
    expect(asCustomer.status).toBe(403);

    const anonymous = await request(app).delete("/api/account/avatar");
    expect(anonymous.status).toBe(401);
  });

  it("reports when the password was last changed (for the security row)", async () => {
    const changedAt = new Date("2026-07-01T03:00:00.000Z");
    await prisma.user.update({ where: { id: admin.userId }, data: { passwordChangedAt: changedAt } });
    const res = await admin.agent.get("/api/account/security");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ passwordChangedAt: changedAt.toISOString() });

    // บัญชีเก่าก่อนระบบเก็บเวลานี้ — ส่ง null ให้หน้าจอซ่อนข้อความ ไม่เดาวันที่
    await prisma.user.update({ where: { id: admin.userId }, data: { passwordChangedAt: null } });
    expect((await admin.agent.get("/api/account/security")).body).toEqual({ passwordChangedAt: null });
  });
});
