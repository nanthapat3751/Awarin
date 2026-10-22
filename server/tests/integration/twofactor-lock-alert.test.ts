import { authenticator } from "otplib";
import request from "supertest";

import { app } from "../../src/app";
import { clearOutbox, lastMailTo } from "../../src/lib/mailer";
import { prisma } from "../../src/lib/prisma";
import { resetAllRateLimits } from "../../src/lib/rate-limit";
import { createAndLoginAdmin, createAndLoginOwner } from "../helpers/test-auth";

/**
 * ขั้น 2FA ถูกระงับ (รหัส 6 หลักผิดครบ 10 ครั้ง) = รหัสผ่านหลุดแล้ว → แจ้ง
 *   เจ้าของบัญชี: กระดิ่ง + อีเมล (ถ้ายืนยันอีเมลแล้ว) · OWNER/ADMIN คนอื่น: กระดิ่ง
 * แจ้งครั้งเดียวตอนเริ่มระงับ ไม่ใช่ทุกครั้งที่โดนกันระหว่างระงับ
 */
// ล็อกอินผิด 10 รอบ (argon2 ช้าโดยตั้งใจ) — บนเครื่อง 2 คอร์ของ CI เกินเพดาน 5 วินาทีเริ่มต้นของ jest
describe("แจ้งเตือนเมื่อขั้น 2FA ถูกระงับ", () => {
  const createdUserIds: string[] = [];

  beforeEach(async () => {
    await resetAllRateLimits();
    clearOutbox();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  async function enableTwoFactor(owner: Awaited<ReturnType<typeof createAndLoginOwner>>) {
    const setup = await owner.agent.post("/api/auth/2fa/setup");
    const secret = setup.body.secret as string;
    await owner.agent.post("/api/auth/2fa/activate").send({ token: authenticator.generate(secret) });
    return secret;
  }

  async function wrongCode(owner: Awaited<ReturnType<typeof createAndLoginOwner>>) {
    const device = request.agent(app);
    await device.post("/api/auth/staff/login").send({ username: owner.username, password: owner.password });
    return device.post("/api/auth/2fa/verify").send({ code: "000000" });
  }

  const notesOf = (userId: string) =>
    prisma.notification.findMany({ where: { userId, message: { contains: "รหัสยืนยัน" } }, select: { message: true, link: true } });

  it("แจ้งเจ้าของบัญชี (กระดิ่ง + อีเมล) และแอดมินคนอื่น (กระดิ่ง) ครั้งเดียว", async () => {
    const owner = await createAndLoginOwner("2fa-alert-owner");
    const admin = await createAndLoginAdmin("2fa-alert-admin");
    createdUserIds.push(owner.userId, admin.userId);
    await prisma.user.update({ where: { id: owner.userId }, data: { emailVerifiedAt: new Date() } });
    await enableTwoFactor(owner);

    for (let i = 0; i < 9; i += 1) {
      if (i % 4 === 0) await resetAllRateLimits();
      expect((await wrongCode(owner)).status).toBe(401);
    }
    // ยังไม่ถึงเพดาน = ยังไม่แจ้ง
    expect(await notesOf(owner.userId)).toHaveLength(0);
    expect((await wrongCode(owner)).status).toBe(423);

    const mine = await notesOf(owner.userId);
    expect(mine).toHaveLength(1);
    expect(mine[0].message).toContain("มีคนกรอกรหัสผ่านของบัญชีคุณถูก");
    expect(mine[0].link).toBe("/account#password");

    const adminNotes = await notesOf(admin.userId);
    expect(adminNotes.some((n) => n.message.includes(owner.username) && n.link === "/users")).toBe(true);

    // อีเมลส่งแบบไม่รอ — ให้เวลาประกอบเมลเสร็จก่อนตรวจ
    await new Promise((r) => setTimeout(r, 300));
    const mail = lastMailTo(owner.email);
    expect(mail?.subject).toContain("มีคนพยายามเข้าบัญชีของคุณ");
    expect(mail?.text).toContain("เปลี่ยนรหัสผ่าน");

    // โดนกันระหว่างระงับ ไม่แจ้งซ้ำ
    expect((await wrongCode(owner)).status).toBe(423);
    expect(await notesOf(owner.userId)).toHaveLength(1);
  }, 20_000);

  it("อีเมลยังไม่ยืนยัน = แจ้งในแอปอย่างเดียว ไม่ส่งเมล", async () => {
    const owner = await createAndLoginOwner("2fa-alert-unverified");
    createdUserIds.push(owner.userId);
    await enableTwoFactor(owner);
    for (let i = 0; i < 10; i += 1) {
      if (i % 4 === 0) await resetAllRateLimits();
      await wrongCode(owner);
    }
    expect(await notesOf(owner.userId)).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 300));
    expect(lastMailTo(owner.email)).toBeUndefined();
  }, 20_000);
});
